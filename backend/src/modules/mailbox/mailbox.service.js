"use strict";

const { google } = require("googleapis");
const repository = require("./mailbox.repository");
const resumeService = require("../resume/resume.service");
const resumeRepository = require("../resume/resume.repository");
const { detectForwardedEmail } = require("../resume/email.extractor.service");
const { prisma } = require("../../config/prisma");
const attemptService = require("../attempt/attempt.service");
const {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
} = require("../../utils/app-error");
const driveService = require("./drive.service");

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
    "https://www.googleapis.com/auth/drive.readonly",
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
    dateRangeSyncEnabled: mailbox.dateRangeSyncEnabled,
    dateRangeSyncFrom: mailbox.dateRangeSyncFrom,
    dateRangeSyncTo: mailbox.dateRangeSyncTo,
    dateRangeLastSyncedAt: mailbox.dateRangeLastSyncedAt,
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

const isSyncInProgress = (userId) => activeMailboxSyncs.has(userId);

/**
 * Executes async mapper functions over items with bounded concurrency.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
async function pMap(items, mapper, concurrency = 3) {
  if (!items || items.length === 0) return [];
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Processes a single Gmail message (direct attachments and Drive files) with
 * proper idempotency and multi-resume partial error accounting.
 */
async function processSingleGmailMessage({
  msg,
  gmail,
  drive,
  mailbox,
  userCompanyId,
  userId,
  existingEvent,
}) {
  let emailEvent = existingEvent;
  let internalDate = null;
  const processedResumeIds = [];
  const itemErrors = [];
  let newResumesCount = 0;

  try {
    if (!emailEvent) {
      emailEvent = await resumeRepository.createInboundEmailEventSafely({
        provider: "google_mailbox",
        providerMessageId: msg.id,
        recipientEmail: mailbox.email,
      });
    } else if (emailEvent.status !== "PROCESSING") {
      await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
        status: "PROCESSING",
      });
    }

    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
    });

    if (fullMsg.data.internalDate) {
      internalDate = parseInt(fullMsg.data.internalDate, 10);
    }

    const payload = fullMsg.data.payload || {};
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
    const sender = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
    const replyTo = headers.find((h) => h.name.toLowerCase() === "reply-to")?.value || "";

    if (emailEvent && emailEvent.id) {
      await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
        subject,
        senderEmail: sender,
      });
    }

    const { attachments, plainTextBody, htmlBody } = driveService.extractMimeElements(payload);
    const driveFileIds = driveService.extractDriveFileIds(plainTextBody, htmlBody);

    let finalEmailBody = plainTextBody.trim();
    if (!finalEmailBody && htmlBody) {
      finalEmailBody = htmlBody
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<\/div>|<\/p>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n\s*\n/g, "\n\n")
        .replace(/&nbsp;/g, " ")
        .trim();
    }
    if (finalEmailBody.length > 5000) {
      finalEmailBody = finalEmailBody.substring(0, 5000) + "\n...[Message truncated]";
    }

    const parsedSender = parseSender(sender);
    const forwardInfo = detectForwardedEmail({
      subject,
      text: finalEmailBody,
      sender: parsedSender.email || sender,
      replyTo,
    });

    const candidateSourceEmail = forwardInfo.isForwarded
      ? forwardInfo.candidateEmail
      : (parsedSender.email || sender);

    // 1. Process direct email attachments
    for (const att of attachments) {
      try {
        const attachment = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: msg.id,
          id: att.attachmentId,
        });

        const buffer = Buffer.from(attachment.data.data, "base64");
        const ext = ("." + (att.filename.split(".").pop() || "")).toLowerCase();
        let inferredMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (ext === ".pdf") inferredMime = "application/pdf";
        else if (ext === ".doc") inferredMime = "application/msword";

        const resumeResult = await resumeService.processResume({
          file: {
            buffer,
            originalname: att.filename,
            mimetype: att.mimeType || inferredMime,
            size: buffer.length,
          },
          source: "INBOUND_EMAIL",
          sourceEmail: candidateSourceEmail,
          isForwarded: forwardInfo.isForwarded,
          inboundEmail: null,
          uploadedByUserId: userId,
          companyId: userCompanyId,
          emailSubject: subject,
          emailBody: finalEmailBody,
          providerMessageId: msg.id,
        });

        const resId = resumeResult?.resumeProcessing?.id || resumeResult?.id;
        if (resId) {
          processedResumeIds.push(resId);
        }
        if (!resumeResult?.duplicate) {
          newResumesCount++;
        }

        if (resumeResult?.candidateId && !resumeResult?.duplicate) {
          await prisma.candidateProfile.updateMany({
            where: { userId: resumeResult.candidateId, companyId: null },
            data: { companyId: userCompanyId },
          });

          if (typeof attemptService.clearCandidatesCache === "function") {
            attemptService.clearCandidatesCache();
          }
        }
      } catch (attachmentError) {
        console.warn(
          `[MailboxSync] Direct attachment "${att.filename}" failed for message ${msg.id}:`,
          attachmentError.message
        );
        itemErrors.push({
          source: "DIRECT_ATTACHMENT",
          name: att.filename,
          code: attachmentError.code || "ATTACHMENT_PROCESSING_FAILED",
          message: attachmentError.message,
        });
      }
    }

    // 2. Process Google Drive resume links
    for (const fileId of driveFileIds) {
      try {
        const driveFile = await driveService.downloadDriveFile({
          drive,
          fileId,
        });

        const resumeResult = await resumeService.processResume({
          file: {
            buffer: driveFile.buffer,
            originalname: driveFile.originalname,
            mimetype: driveFile.mimetype,
            size: driveFile.size,
          },
          source: "INBOUND_EMAIL",
          sourceEmail: candidateSourceEmail,
          isForwarded: forwardInfo.isForwarded,
          inboundEmail: null,
          uploadedByUserId: userId,
          companyId: userCompanyId,
          emailSubject: subject,
          emailBody: finalEmailBody,
          providerMessageId: msg.id,
        });

        const resId = resumeResult?.resumeProcessing?.id || resumeResult?.id;
        if (resId) {
          processedResumeIds.push(resId);
        }
        if (!resumeResult?.duplicate) {
          newResumesCount++;
        }

        if (resumeResult?.candidateId && !resumeResult?.duplicate) {
          await prisma.candidateProfile.updateMany({
            where: { userId: resumeResult.candidateId, companyId: null },
            data: { companyId: userCompanyId },
          });

          if (typeof attemptService.clearCandidatesCache === "function") {
            attemptService.clearCandidatesCache();
          }
        }
      } catch (driveError) {
        console.warn(
          `[MailboxSync] Google Drive file ${fileId} failed for message ${msg.id}:`,
          driveError.message
        );
        itemErrors.push({
          source: "GOOGLE_DRIVE",
          fileId,
          code: driveError.code || "DRIVE_PROCESSING_FAILED",
          message: driveError.message,
        });
      }
    }

    // 3. Update InboundEmailEvent status accurately
    const totalDiscovered = attachments.length + driveFileIds.length;

    if (totalDiscovered === 0) {
      if (emailEvent?.id) {
        await resumeRepository.markInboundEmailEventCompleted(emailEvent.id, null);
      }
      return {
        success: true,
        processedResumes: 0,
        failed: false,
        internalDate,
      };
    }

    if (itemErrors.length === 0) {
      // All discovered items succeeded!
      if (emailEvent?.id) {
        await resumeRepository.markInboundEmailEventCompleted(
          emailEvent.id,
          processedResumeIds[0] || null
        );
      }
      return {
        success: true,
        processedResumes: newResumesCount,
        failed: false,
        internalDate,
      };
    }

    // Multi-resume partial or complete failure: Mark FAILED so it remains retryable
    const isPartial = processedResumeIds.length > 0;
    const errCode = isPartial ? "PARTIAL_ATTACHMENT_FAILURE" : (itemErrors[0]?.code || "PROCESSING_FAILED");
    const errMsg = isPartial
      ? `${processedResumeIds.length} of ${totalDiscovered} resumes succeeded. Remaining failed: ${itemErrors.map((e) => `[${e.code}] ${e.message}`).join("; ")}`
      : itemErrors.map((e) => `[${e.code}] ${e.message}`).join("; ");

    if (emailEvent?.id) {
      await resumeRepository.markInboundEmailEventFailed(emailEvent.id, errCode, errMsg);
    }

    return {
      success: false,
      processedResumes: newResumesCount,
      failed: true,
      internalDate,
      error: errMsg,
    };
  } catch (msgError) {
    console.warn(`[MailboxSync] Error processing message ${msg.id}:`, msgError.message);
    if (emailEvent?.id) {
      try {
        await resumeRepository.markInboundEmailEventFailed(
          emailEvent.id,
          msgError.code || "MESSAGE_PROCESSING_ERROR",
          msgError.message
        );
      } catch (_) {}
    }
    return {
      success: false,
      processedResumes: 0,
      failed: true,
      internalDate,
      error: msgError.message,
    };
  }
}

async function syncMailboxForUser(userId, maxDurationMs = 25000, customDateRange = null) {
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
    const drive = driveService.createDriveClient(oauth2Client);

    const isCustomDateRange = !!customDateRange;
    let queryStr = "((has:attachment (filename:pdf OR filename:docx OR filename:doc)) OR has:drive) -from:me";

    if (isCustomDateRange) {
      const fromDateObj = new Date(customDateRange.fromDate);
      fromDateObj.setDate(fromDateObj.getDate() - 1);
      const fromStr = fromDateObj.toISOString().split("T")[0].replace(/-/g, "/");

      const toDateObj = new Date(customDateRange.toDate);
      toDateObj.setDate(toDateObj.getDate() + 1);
      const toStr = toDateObj.toISOString().split("T")[0].replace(/-/g, "/");

      queryStr += ` after:${fromStr} before:${toStr}`;
    } else {
      let effectiveSinceMs = null;
      if (mailbox.lastSyncedAt) {
        // 60-second overlap buffer to prevent missing in-flight emails or clock skew
        effectiveSinceMs = mailbox.lastSyncedAt.getTime() - 60000;
      } else {
        // Fresh mailbox: 30-day initial window prevents unbounded scanning of entire inbox
        effectiveSinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      }

      // Check for oldest unrecovered FAILED event to make sure failures remain retryable
      try {
        const oldestFailed = await prisma.inboundEmailEvent.findFirst({
          where: {
            recipientEmail: mailbox.email,
            status: "FAILED",
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        if (oldestFailed?.createdAt) {
          const failedSinceMs = oldestFailed.createdAt.getTime() - 60000;
          effectiveSinceMs = Math.min(effectiveSinceMs, failedSinceMs);
        }
      } catch (_) {}

      const epoch = Math.max(0, Math.floor(effectiveSinceMs / 1000));
      queryStr += ` after:${epoch}`;
    }

    let pageToken = isCustomDateRange ? (customDateRange.pageToken || null) : null;
    let pagesScanned = 0;
    const MAX_PAGES_PER_SYNC = 5;
    const startTime = Date.now();

    let totalScanned = 0;
    let totalSkipped = 0;
    let totalProcessedResumes = 0;
    let totalFailed = 0;
    let highestSuccessInternalDate = null;
    let lowestFailureInternalDate = null;

    while (pagesScanned < MAX_PAGES_PER_SYNC) {
      if (Date.now() - startTime >= maxDurationMs) {
        break;
      }

      pagesScanned++;
      const listParams = {
        userId: "me",
        q: queryStr,
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

      totalScanned += messages.length;

      // Batched lookup of existing InboundEmailEvents
      const messageIds = messages.map((m) => m.id);
      const existingEvents = await resumeRepository.findInboundEmailEventsByMessageIds(
        "google_mailbox",
        messageIds
      );
      const eventMap = new Map(existingEvents.map((e) => [e.providerMessageId, e]));

      const actionableMsgs = [];

      for (const msg of messages) {
        const existing = eventMap.get(msg.id);
        if (existing && existing.status === "COMPLETED") {
          totalSkipped++;
          const existingDate = existing.receivedAt ? existing.receivedAt.getTime() : null;
          if (existingDate && (!highestSuccessInternalDate || existingDate > highestSuccessInternalDate)) {
            highestSuccessInternalDate = existingDate;
          }
        } else {
          actionableMsgs.push(msg);
        }
      }

      // In incremental mode, if every message in the page is already completed, we've caught up!
      if (actionableMsgs.length === 0 && !isCustomDateRange) {
        break;
      }

      // Process actionable messages with bounded concurrency (3 concurrent workers)
      const pageResults = await pMap(
        actionableMsgs,
        async (msg) => {
          return await processSingleGmailMessage({
            msg,
            gmail,
            drive,
            mailbox,
            userCompanyId,
            userId,
            existingEvent: eventMap.get(msg.id),
          });
        },
        3
      );

      for (const item of pageResults) {
        if (item.processedResumes > 0) {
          totalProcessedResumes += item.processedResumes;
        }
        if (item.failed) {
          totalFailed++;
          if (item.internalDate) {
            if (!lowestFailureInternalDate || item.internalDate < lowestFailureInternalDate) {
              lowestFailureInternalDate = item.internalDate;
            }
          }
        } else {
          if (item.internalDate) {
            if (!highestSuccessInternalDate || item.internalDate > highestSuccessInternalDate) {
              highestSuccessInternalDate = item.internalDate;
            }
          }
        }
      }

      pageToken = res.data.nextPageToken || null;
      if (!pageToken) {
        break;
      }
    }

    const existingLastSynced = mailbox.lastSyncedAt ? mailbox.lastSyncedAt.getTime() : 0;
    let newCheckpoint = null;

    if (!isCustomDateRange) {
      if (lowestFailureInternalDate) {
        // Critical safety invariant: Never advance checkpoint past unhandled or failed items!
        const safeCheckpointMs = lowestFailureInternalDate - 1000;
        newCheckpoint = new Date(Math.max(existingLastSynced, safeCheckpointMs));
      } else if (highestSuccessInternalDate) {
        newCheckpoint = new Date(Math.max(existingLastSynced, highestSuccessInternalDate));
      } else if (!mailbox.lastSyncedAt) {
        newCheckpoint = new Date();
      } else {
        newCheckpoint = mailbox.lastSyncedAt;
      }

      const syncStatusUpdate = {
        lastError: null,
        lastSyncedAt: newCheckpoint,
        backfillComplete: true,
        backfillPageToken: null,
      };

      await repository.updateMailboxSyncStatus(userId, syncStatusUpdate);
    } else if (
      customDateRange?.isCronDateRangeSync ||
      customDateRange?.isFutureDateSync
    ) {
      if (highestSuccessInternalDate && !lowestFailureInternalDate) {
        const existingDateRangeLastSynced = mailbox.dateRangeLastSyncedAt ? mailbox.dateRangeLastSyncedAt.getTime() : 0;
        const newDateRangeLastSynced = new Date(Math.max(existingDateRangeLastSynced, highestSuccessInternalDate));
        await repository.updateMailboxSyncStatus(userId, {
          dateRangeLastSyncedAt: newDateRangeLastSynced,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    console.info(
      `[MailboxSync] Completed for ${mailbox.email} in ${durationMs}ms: scanned=${totalScanned}, skipped=${totalSkipped}, newResumes=${totalProcessedResumes}, failed=${totalFailed}`
    );

    return {
      success: true,
      scanned: totalScanned,
      skipped: totalSkipped,
      processedResumes: totalProcessedResumes,
      failed: totalFailed,
      durationMs,
      lastSyncedAt: newCheckpoint || mailbox.lastSyncedAt,
      syncedAt: new Date(),
      nextPageToken: isCustomDateRange ? pageToken : undefined,
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

async function stopAutomaticSync(userId) {
  const mailbox = await repository.findMailboxByUserId(userId);
  if (!mailbox) {
    return { success: true };
  }

  await repository.updateMailboxSyncStatus(userId, { dateRangeSyncEnabled: false });
  return { success: true };
}

function startBackgroundSync(userId, dateRangeOptions = null) {
  if (isSyncInProgress(userId)) {
    return;
  }

  (async () => {
    try {
      if (dateRangeOptions?.isFutureDateSync) {
        await repository.updateMailboxSyncStatus(userId, {
          dateRangeSyncEnabled: true,
          dateRangeSyncFrom: dateRangeOptions.dateRangeSyncFrom,
          dateRangeSyncTo: dateRangeOptions.dateRangeSyncTo,
          dateRangeLastSyncedAt: dateRangeOptions.dateRangeSyncFrom,
        });
      }

      await syncMailboxForUser(userId, 60000, dateRangeOptions);
    } catch (error) {
      if (error?.code === "MAILBOX_SYNC_IN_PROGRESS") {
        return;
      }
      console.error(`[MailboxSync] Background sync failed for user ${userId}:`, error.message);
    }
  })();
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getMailboxStatus,
  syncMailboxForUser,
  disconnectMailbox,
  stopAutomaticSync,
  isSyncInProgress,
  startBackgroundSync,
};
