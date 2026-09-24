"use strict";

const { google } = require("googleapis");
const repository = require("./mailbox.repository");
const resumeService = require("../resume/resume.service");
const resumeRepository = require("../resume/resume.repository");
const { prisma } = require("../../config/prisma");
const {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
} = require("../../utils/app-error");

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let redirectUri = process.env.GOOGLE_REDIRECT_URI;

  // Auto-heal offline ngrok URLs or missing redirectUri in production
  if (!redirectUri || redirectUri.includes("ngrok")) {
    const baseUrl = process.env.BACKEND_URL || process.env.APP_URL || "https://walkingdreamzhrmanagement.up.railway.app";
    redirectUri = `${baseUrl.replace(/\/$/, "")}/api/v1/mailbox/google/callback`;
  }

  if (!clientId || !clientSecret || !redirectUri) {
    throw badRequest(
      "Google OAuth credentials missing in environment variables. Please check Railway setup.",
      "GOOGLE_OAUTH_CONFIG_MISSING"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(userId) {
  const oauth2Client = createOAuth2Client();

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: scopes,
    state: userId,
  });

  return authUrl;
}

async function handleCallback(code, userId) {
  if (!code) {
    throw badRequest("Authorization code is required", "AUTH_CODE_REQUIRED");
  }

  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const userEmail = userInfo.data.email;

  if (!userEmail) {
    throw badRequest("Failed to retrieve Google user email", "GOOGLE_EMAIL_FETCH_FAILED");
  }

  if (!tokens.refresh_token) {
    const existing = await repository.findMailboxByUserId(userId);
    if (!existing || !existing.refreshToken) {
      throw badRequest(
        "Google did not return a refresh token. Please revoke app access in your Google account and try again.",
        "REFRESH_TOKEN_MISSING"
      );
    }
    tokens.refresh_token = existing.refreshToken;
  }

  const tokenExpiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : null;

  const mailbox = await repository.upsertUserMailbox({
    userId,
    email: userEmail,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token || null,
    tokenExpiresAt,
  });

  return {
    email: mailbox.email,
    isSyncActive: mailbox.isSyncActive,
    lastSyncedAt: mailbox.lastSyncedAt,
  };
}

async function getMailboxStatus(userId) {
  const mailbox = await repository.findMailboxByUserId(userId);
  if (!mailbox) {
    return {
      connected: false,
      email: null,
      isSyncActive: false,
      lastSyncedAt: null,
    };
  }

  return {
    connected: true,
    email: mailbox.email,
    isSyncActive: mailbox.isSyncActive,
    lastSyncedAt: mailbox.lastSyncedAt,
    lastError: mailbox.lastError,
  };
}

function parseSender(senderStr) {
  if (!senderStr) return { email: null, name: null };
  const match = senderStr.match(/(?:([^<]+)<)?([^>]+)>/);
  if (match) {
    const name = match[1] ? match[1].trim().replace(/^"|"$/g, "") : "";
    const email = match[2] ? match[2].trim().toLowerCase() : "";
    return { email, name };
  }
  if (senderStr.includes("@")) {
    return { email: senderStr.trim().toLowerCase(), name: "" };
  }
  return { email: null, name: null };
}

const activeMailboxSyncs = new Set();

async function syncMailboxForUser(userId) {
  if (activeMailboxSyncs.has(userId)) {
    throw conflict(
      "Mailbox sync is already in progress for your account. Please wait a moment.",
      "MAILBOX_SYNC_IN_PROGRESS"
    );
  }

  activeMailboxSyncs.add(userId);

  try {
    const mailbox = await repository.findMailboxByUserId(userId);
    if (!mailbox || !mailbox.refreshToken) {
      throw notFound(
        "No connected Google Mailbox found. Please connect your Gmail account first.",
        "MAILBOX_NOT_CONNECTED"
      );
    }

    const companyMember = await prisma.companyMember.findFirst({
      where: { userId },
      select: { companyId: true },
    });
    const userCompanyId = companyMember?.companyId || null;

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: mailbox.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let processedCount = 0;
    let pageToken = null;
    let keepFetching = true;
    let pagesScanned = 0;
    const MAX_NEW_RESUMES_PER_BATCH = 15;
    const MAX_PAGES_PER_SYNC = 5;

    while (keepFetching && processedCount < MAX_NEW_RESUMES_PER_BATCH && pagesScanned < MAX_PAGES_PER_SYNC) {
      pagesScanned++;
      const listParams = {
        userId: "me",
        q: "has:attachment (filename:pdf OR filename:docx)",
        maxResults: 25,
      };
      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      const res = await gmail.users.messages.list(listParams);
      const messages = res.data.messages || [];

      if (messages.length === 0) {
        break;
      }

      for (const msg of messages) {
        try {
          if (processedCount >= MAX_NEW_RESUMES_PER_BATCH) {
            keepFetching = false;
            break;
          }

          // DB check: Skip if email was already completed to avoid re-downloading attachments
          const existingEvent = await resumeRepository.findInboundEmailEvent(
            "google_mailbox",
            msg.id
          );

          if (existingEvent && existingEvent.status === "COMPLETED") {
            continue;
          }

          const fullMsg = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
          });

          const payload = fullMsg.data.payload || {};
          const headers = payload.headers || [];
          const subject =
            headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
          const sender =
            headers.find((h) => h.name.toLowerCase() === "from")?.value || "";

          const emailEvent = await resumeRepository.createInboundEmailEventSafely({
            provider: "google_mailbox",
            providerMessageId: msg.id,
            recipientEmail: mailbox.email,
            senderEmail: sender,
            subject,
          });

          const parts = payload.parts || [];
          let messageProcessed = false;

          for (const part of parts) {
            if (part.filename && part.body && part.body.attachmentId) {
              const ext = part.filename.toLowerCase();
              if (ext.endsWith(".pdf") || ext.endsWith(".docx")) {
                try {
                  const attachment = await gmail.users.messages.attachments.get({
                    userId: "me",
                    messageId: msg.id,
                    id: part.body.attachmentId,
                  });

                  const buffer = Buffer.from(attachment.data.data, "base64");

                  const inferredMime = ext.endsWith(".pdf")
                    ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

                  const parsedSender = parseSender(sender);

                  const resumeResult = await resumeService.processResume({
                    file: {
                      buffer,
                      originalname: part.filename,
                      mimetype: part.mimeType || inferredMime,
                      size: buffer.length,
                    },
                    source: "INBOUND_EMAIL",
                    inboundEmail: parsedSender.email || sender,
                    uploadedByUserId: userId,
                  });

                  processedCount++;
                  messageProcessed = true;

                  const extractedData = resumeResult?.extractedData || {};
                  const candidateEmail = extractedData.email || parsedSender.email;
                  const candidateName = extractedData.name || parsedSender.name || "";

                  if (candidateEmail) {
                    await resumeRepository.ensureCandidateProfile(
                      { id: null, email: candidateEmail, name: candidateName },
                      extractedData,
                      userCompanyId
                    );
                  }

                  if (emailEvent?.id) {
                    await resumeRepository.markInboundEmailEventCompleted(
                      emailEvent.id,
                      resumeResult?.id || null
                    );
                  }
                } catch (attachmentError) {
                  console.warn(
                    `[MailboxSync] Skipping attachment "${part.filename}":`,
                    attachmentError.message
                  );
                }
              }
            }
          }

          if (
            !messageProcessed &&
            emailEvent?.id &&
            emailEvent.status !== "COMPLETED"
          ) {
            await resumeRepository.markInboundEmailEventCompleted(
              emailEvent.id,
              null
            );
          }
        } catch (msgError) {
          console.warn(
            `[MailboxSync] Error processing message ${msg.id}:`,
            msgError.message
          );
        }
      }

      pageToken = res.data.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    await repository.updateMailboxSyncStatus(userId, {
      lastSyncedAt: new Date(),
      lastError: null,
    });

    console.info(`[MailboxSync] Sync completed for ${mailbox.email}. Total new resumes ingested: ${processedCount}`);

    return {
      success: true,
      processedResumes: processedCount,
      syncedAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error.message || "Failed to sync Gmail inbox";
    await repository.updateMailboxSyncStatus(userId, {
      lastError: errorMessage,
    });

    if (error instanceof AppError || error?.name === "AppError") {
      throw error;
    }

    if (
      errorMessage.toLowerCase().includes("invalid_grant") ||
      errorMessage.toLowerCase().includes("token has been revoked") ||
      error.code === 401
    ) {
      throw unauthorized(
        "Google Mailbox authorization expired or revoked. Please click Disconnect and reconnect your Gmail account.",
        "GMAIL_AUTH_EXPIRED"
      );
    }

    if (
      errorMessage.toLowerCase().includes("insufficient authentication scopes") ||
      errorMessage.toLowerCase().includes("insufficient permissions") ||
      error.code === 403
    ) {
      throw forbidden(
        "Gmail read permission is missing. Please click Disconnect and then Connect with Google again to grant full permissions.",
        "GMAIL_PERMISSION_INSUFFICIENT"
      );
    }

    throw badRequest(
      errorMessage,
      error?.code || "GMAIL_SYNC_FAILED"
    );
  } finally {
    activeMailboxSyncs.delete(userId);
  }
}

async function disconnectMailbox(userId) {
  const mailbox = await repository.findMailboxByUserId(userId);
  if (!mailbox) {
    return { success: true };
  }

  await repository.deleteUserMailbox(userId);
  return { success: true };
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getMailboxStatus,
  syncMailboxForUser,
  disconnectMailbox,
};
