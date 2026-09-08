"use strict";

const { google } = require("googleapis");
const repository = require("./mailbox.repository");
const resumeService = require("../resume/resume.service");

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error(
      "Google OAuth credentials missing in environment variables"
    );
    error.code = "GOOGLE_OAUTH_CONFIG_MISSING";
    error.statusCode = 500;
    throw error;
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
    prompt: "consent",
    scope: scopes,
    state: userId,
  });

  return authUrl;
}

async function handleCallback(code, userId) {
  if (!code) {
    const error = new Error("Authorization code is required");
    error.code = "AUTH_CODE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const userEmail = userInfo.data.email;

  if (!userEmail) {
    const error = new Error("Failed to retrieve Google user email");
    error.code = "GOOGLE_EMAIL_FETCH_FAILED";
    error.statusCode = 400;
    throw error;
  }

  if (!tokens.refresh_token) {
    const existing = await repository.findMailboxByUserId(userId);
    if (!existing || !existing.refreshToken) {
      const error = new Error(
        "Google did not return a refresh token. Please revoke app access in your Google account and try again."
      );
      error.code = "REFRESH_TOKEN_MISSING";
      error.statusCode = 400;
      throw error;
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

async function syncMailboxForUser(userId) {
  const mailbox = await repository.findMailboxByUserId(userId);
  if (!mailbox || !mailbox.refreshToken) {
    const error = new Error("No connected Google Mailbox found");
    error.code = "MAILBOX_NOT_CONNECTED";
    error.statusCode = 404;
    throw error;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: mailbox.refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let processedCount = 0;

  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "has:attachment (filename:pdf OR filename:docx)",
      maxResults: 10,
    });

    const messages = res.data.messages || [];

    for (const msg of messages) {
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
      });

      const parts = fullMsg.data.payload.parts || [];
      for (const part of parts) {
        if (part.filename && part.body && part.body.attachmentId) {
          const ext = part.filename.toLowerCase();
          if (ext.endsWith(".pdf") || ext.endsWith(".docx")) {
            const attachment = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: msg.id,
              id: part.body.attachmentId,
            });

            const buffer = Buffer.from(attachment.data.data, "base64");

            await resumeService.processResume({
              file: {
                buffer,
                originalname: part.filename,
                mimetype: part.mimeType || "application/pdf",
                size: buffer.length,
              },
              source: "INBOUND_EMAIL",
              uploadedByUserId: userId,
            });

            processedCount++;
          }
        }
      }
    }

    await repository.updateMailboxSyncStatus(userId, {
      lastSyncedAt: new Date(),
      lastError: null,
    });

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

    if (
      errorMessage.toLowerCase().includes("insufficient authentication scopes") ||
      error.code === 403
    ) {
      const customError = new Error(
        "Gmail read permission is missing. Please click Disconnect and then Connect with Google again to grant full permissions."
      );
      customError.code = "GMAIL_PERMISSION_INSUFFICIENT";
      customError.statusCode = 403;
      throw customError;
    }

    throw error;
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
