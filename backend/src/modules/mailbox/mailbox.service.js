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

/**
 * Conservative relevance filtering:
 * Skips clearly unrelated emails (e.g. invoices, receipts, shipping updates, calendar RSVPs, security alerts).
 * Crucial rule: Uncertain messages (including generic subjects, applicant names, or empty subjects)
 * must NOT be rejected. They must proceed directly to document verification.
 */
function isClearlyUnrelatedEmail(subject = "", sender = "", body = "") {
  const sub = String(subject || "").toLowerCase().trim();
  const from = String(sender || "").toLowerCase().trim();

  // 1. If subject contains explicit resume / candidate / job application keywords, it is NEVER unrelated
  const applicationKeywordsRegex =
    /\b(resume|cv|curriculum\s+vitae|application|applying|applicant|candidate|job|position|internship|hiring|portfolio|profile)\b/i;
  if (applicationKeywordsRegex.test(sub)) {
    return false;
  }

  // 2. Known automated unrelated sender domains or addresses
  const unrelatedSenders = [
    "no-reply", "noreply", "billing", "receipts", "orders", "notifications",
    "delivery", "shipping", "mailer-daemon", "security", "support@uber", "auto-confirm"
  ];
  const isUnrelatedSender = unrelatedSenders.some((s) => from.includes(s));

  // 3. Clearly unrelated subject patterns
  const unrelatedSubjectPatterns = [
    /\b(invoice|receipt|payment\s+received|bill\s+due|statement|order\s+confirmation|shipping\s+update|delivery\s+update|tracking\s+number)\b/i,
    /\b(security\s+alert|password\s+reset|verify\s+your\s+email|two-factor\s+authentication|2fa\s+code)\b/i,
    /\b(invitation\s+declined|invitation\s+accepted|flight\s+booking|hotel\s+reservation|uber\s+trip|amazon\s+order)\b/i,
    /\b(newsletter|weekly\s+digest|promotional\s+offer|discount\s+coupon)\b/i,
  ];

  const matchesUnrelatedSubject = unrelatedSubjectPatterns.some((pattern) => pattern.test(sub));
  if (matchesUnrelatedSubject) {
    return true;
  }

  // 4. Automated sender with transaction / billing body markers
  if (
    isUnrelatedSender &&
    /\b(total\s+amount|order\s+id|transaction\s+id|billing\s+address|shipping\s+address)\b/i.test(body)
  ) {
    return true;
  }

  // Uncertain messages MUST proceed to document verification
  return false;
}

/**
 * Resolves exact millisecond start and end bounds for a date range in a given timezone.
 *
 * @param {string|Date|number} fromDate - e.g. "2026-10-29", ISO string, or Date
 * @param {string|Date|number} toDate - e.g. "2026-10-29", ISO string, or Date
 * @param {string} [timezone="UTC"] - IANA timezone (e.g. "Asia/Kolkata", "America/New_York", "UTC")
 * @returns {{ startTimestampMs: number, endTimestampMs: number, fromDateStr: string, toDateStr: string }|null}
 */
function resolveDateRangeBounds(fromDate, toDate, timezone = "UTC") {
  if (!fromDate || !toDate) return null;

  function parseBound(val, isEndOfDay) {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      if (isEndOfDay) {
        const d = new Date(val);
        d.setUTCHours(23, 59, 59, 999);
        return d.getTime();
      }
      return val.getTime();
    }
    if (typeof val === "number") {
      return isNaN(val) ? null : val;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
      if (isDateOnly) {
        const timeStr = isEndOfDay ? "23:59:59.999" : "00:00:00.000";
        const [year, month, day] = trimmed.split("-").map(Number);
        const [hour, minute, secMs] = timeStr.split(":");
        const [second, ms] = secMs.split(".").map(Number);
        const utcEpoch = Date.UTC(year, month - 1, day, Number(hour), Number(minute), second, ms || 0);

        if (!timezone || timezone.toUpperCase() === "UTC") {
          return utcEpoch;
        }

        try {
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
          });
          const d = new Date(utcEpoch);
          const parts = formatter.formatToParts(d);
          const p = {};
          for (const part of parts) p[part.type] = part.value;
          const h = p.hour === "24" ? 0 : Number(p.hour);
          const localInTz = Date.UTC(
            Number(p.year),
            Number(p.month) - 1,
            Number(p.day),
            h,
            Number(p.minute),
            Number(p.second),
            ms || 0
          );
          const offset = localInTz - utcEpoch;
          return utcEpoch - offset;
        } catch (_) {
          return utcEpoch;
        }
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        if (isEndOfDay && !trimmed.includes("T")) {
          parsed.setUTCHours(23, 59, 59, 999);
        }
        return parsed.getTime();
      }
    }
    return null;
  }

  const startTimestampMs = parseBound(fromDate, false);
  const endTimestampMs = parseBound(toDate, true);

  if (startTimestampMs === null || endTimestampMs === null) return null;

  return {
    startTimestampMs,
    endTimestampMs,
    fromDateStr: new Date(startTimestampMs).toISOString().split("T")[0],
    toDateStr: new Date(endTimestampMs).toISOString().split("T")[0],
  };
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
  customDateRange,
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

    // STRICT SERVER-SIDE DATE-RANGE GUARD:
    // Only messages whose internalDate falls strictly within the requested [startTimestampMs, endTimestampMs]
    // may be processed. Out-of-range messages must be skipped immediately without downloading attachments,
    // parsing resumes, or creating candidates.
    const reqStartMs = customDateRange?.startTimestampMs ?? null;
    const reqEndMs = customDateRange?.endTimestampMs ?? null;
    const isOutOfRange = (
      (reqStartMs !== null && internalDate !== null && internalDate < reqStartMs) ||
      (reqEndMs !== null && internalDate !== null && internalDate > reqEndMs)
    );

    if (isOutOfRange) {
      console.info(
        `[MailboxSync] Skipped message ${msg.id}: internalDate ${new Date(internalDate).toISOString()} is outside requested range ${new Date(reqStartMs).toISOString()} - ${new Date(reqEndMs).toISOString()}`
      );
      if (emailEvent && emailEvent.id) {
        await resumeRepository.markInboundEmailEventCompleted(emailEvent.id, null);
        try {
          await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
            subject,
            senderEmail: sender,
            ...(internalDate ? { receivedAt: new Date(internalDate) } : {}),
            errorCode: "SKIPPED_OUT_OF_DATE_RANGE",
            errorMessage: `Message date (${new Date(internalDate).toISOString()}) is outside requested sync range (${new Date(reqStartMs).toISOString()} to ${new Date(reqEndMs).toISOString()})`,
          });
        } catch (_) {}
      }
      return {
        success: true,
        processedResumes: 0,
        skipped: true,
        skippedOutOfRange: true,
        failed: false,
        internalDate,
      };
    }

    if (emailEvent && emailEvent.id) {
      await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
        subject,
        senderEmail: sender,
        ...(internalDate ? { receivedAt: new Date(internalDate) } : {}),
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

    const totalDiscovered = attachments.length + driveFileIds.length;

    if (totalDiscovered === 0) {
      if (emailEvent?.id) {
        await resumeRepository.markInboundEmailEventCompleted(emailEvent.id, null);
      }
      return {
        success: true,
        processedResumes: 0,
        skipped: true,
        failed: false,
        internalDate,
      };
    }

    if (isClearlyUnrelatedEmail(subject, sender, finalEmailBody)) {
      if (emailEvent?.id) {
        await resumeRepository.markInboundEmailEventCompleted(emailEvent.id, null);
        try {
          await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
            errorCode: "SKIPPED_UNRELATED",
            errorMessage: "Skipped as clearly unrelated email: " + (subject || "No Subject"),
          });
        } catch (_) {}
      }
      return {
        success: true,
        processedResumes: 0,
        skipped: true,
        skippedUnrelated: true,
        failed: false,
        internalDate,
      };
    }

    const DETERMINISTIC_ERROR_CODES = new Set([
      "NOT_A_TECH_RESUME",
      "NOT_A_RESUME",
      "RESUME_TEXT_EXTRACTION_FAILED",
      "RESUME_FILE_EMPTY",
      "INVALID_FILE_SIGNATURE",
      "UNSUPPORTED_FILE_TYPE",
      "RESUME_FILE_TOO_LARGE",
      "DRIVE_FILE_NOT_FOUND",
      "CANDIDATE_EMAIL_CONFLICT",
      "SKIPPED_UNRELATED",
    ]);

    const isDeterministic = (err) => {
      if (!err) return false;
      if (err.isDeterministic) return true;
      const code = err.code || "";
      if (DETERMINISTIC_ERROR_CODES.has(code)) return true;
      const msg = String(err.message || "").toLowerCase();
      return (
        msg.includes("fewer than 2 valid technical skills") ||
        msg.includes("non-tech candidate profile") ||
        msg.includes("not a resume") ||
        msg.includes("jd_language_detected") ||
        msg.includes("unsupported") ||
        msg.includes("invalid file signature") ||
        msg.includes("belongs to a non-candidate account") ||
        msg.includes("invalid pdf structure")
      );
    };

    // 1. Process direct email attachments
    for (const att of attachments) {
      try {
        const MAX_RESUME_SIZE = 20 * 1024 * 1024;
        if (att.size && att.size > MAX_RESUME_SIZE) {
          const sizeErr = new Error("Attachment exceeds maximum allowed resume size (20MB)");
          sizeErr.code = "RESUME_FILE_TOO_LARGE";
          sizeErr.isDeterministic = true;
          throw sizeErr;
        }

        const attachment = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: msg.id,
          id: att.attachmentId,
        });

        const rawData = attachment.data?.data;
        const buffer = rawData ? Buffer.from(rawData, "base64") : Buffer.alloc(0);
        if (!buffer || buffer.length === 0) {
          const emptyErr = new Error("Resume file is empty");
          emptyErr.code = "RESUME_FILE_EMPTY";
          emptyErr.isDeterministic = true;
          throw emptyErr;
        }
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
          attachmentId: att.attachmentId,
          resumeFileName: att.filename,
          resumeMimeType: att.mimeType || inferredMime,
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
          isDeterministic: isDeterministic(attachmentError),
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
          driveFileId: fileId,
          resumeFileName: driveFile.originalname,
          resumeMimeType: driveFile.mimetype,
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
          isDeterministic: isDeterministic(driveError),
        });
      }
    }

    // 3. Update InboundEmailEvent status accurately with attachment isolation
    if (itemErrors.length === 0) {
      // All discovered items succeeded
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

    const hasTransientFailures = itemErrors.some((e) => !e.isDeterministic);

    // Case A: At least one resume succeeded
    if (processedResumeIds.length > 0) {
      if (!hasTransientFailures) {
        // Remaining items were deterministic auxiliary/non-resume files (e.g. cover letter or brochure)
        // Primary candidate resume was successfully ingested! Complete event without retries.
        if (emailEvent?.id) {
          await resumeRepository.markInboundEmailEventCompleted(
            emailEvent.id,
            processedResumeIds[0]
          );
        }
        return {
          success: true,
          processedResumes: newResumesCount,
          failed: false,
          internalDate,
        };
      }
    }

    // Case B: All items failed deterministically (e.g. clearly non-tech resume, cover letter only)
    if (!hasTransientFailures) {
      if (emailEvent?.id) {
        await resumeRepository.markInboundEmailEventCompleted(emailEvent.id, null);
        try {
          await resumeRepository.updateInboundEmailEvent(emailEvent.id, {
            errorCode: itemErrors[0]?.code || "SKIPPED_INELIGIBLE",
            errorMessage: itemErrors.map((e) => `[${e.code}] ${e.message}`).join("; "),
          });
        } catch (_) {}
      }
      return {
        success: true,
        processedResumes: 0,
        skipped: true,
        failed: false,
        internalDate,
      };
    }

    // Case C: One or more potentially valid Tech resumes failed transiently: Mark FAILED for retry
    const isPartial = processedResumeIds.length > 0;
    const transientErrors = itemErrors.filter((e) => !e.isDeterministic);
    const errCode = isPartial
      ? "PARTIAL_ATTACHMENT_FAILURE"
      : (transientErrors[0]?.code || itemErrors[0]?.code || "PROCESSING_FAILED");
    const rawErrMsg = isPartial
      ? `${processedResumeIds.length} of ${totalDiscovered} resumes succeeded. Transiently failed: ${transientErrors.map((e) => `[${e.code}] ${e.message}`).join("; ")}`
      : transientErrors.map((e) => `[${e.code}] ${e.message}`).join("; ");

    // Bounded retries: track attempt count
    const attemptMatch = (emailEvent?.errorMessage || "").match(/\[Attempt (\d+)\/3\]/);
    const prevAttempt = attemptMatch ? parseInt(attemptMatch[1], 10) : 1;
    const nextAttempt = prevAttempt + 1;
    const isPermanent = nextAttempt > 3;

    const finalErrCode = isPermanent ? "PERMANENT_FAILURE" : errCode;
    const finalErrMsg = isPermanent
      ? `[Attempt 3/3] [PERMANENT_FAILURE] Max retries exceeded. ${rawErrMsg}`
      : `[Attempt ${nextAttempt}/3] ${rawErrMsg}`;

    if (emailEvent?.id) {
      await resumeRepository.markInboundEmailEventFailed(emailEvent.id, finalErrCode, finalErrMsg);
    }

    return {
      success: false,
      processedResumes: newResumesCount,
      failed: true,
      internalDate,
      error: finalErrMsg,
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
    let bounds = null;
    let startTimestampMs = null;
    let endTimestampMs = null;

    if (isCustomDateRange) {
      bounds = resolveDateRangeBounds(
        customDateRange.dateRangeSyncFrom || customDateRange.fromDate,
        customDateRange.dateRangeSyncTo || customDateRange.toDate,
        customDateRange.timezone || "UTC"
      );
      startTimestampMs = customDateRange.startTimestampMs ?? bounds?.startTimestampMs ?? null;
      endTimestampMs = customDateRange.endTimestampMs ?? bounds?.endTimestampMs ?? null;
    }

    const isBackfillMode = !isCustomDateRange && (!mailbox.lastSyncedAt || (mailbox.backfillPageToken && !mailbox.backfillComplete));

    let queryStr = "((has:attachment (filename:pdf OR filename:docx OR filename:doc)) OR has:drive) -from:me";

    if (isCustomDateRange && startTimestampMs && endTimestampMs) {
      const startEpochSec = Math.max(0, Math.floor(startTimestampMs / 1000) - 1);
      const endEpochSec = Math.max(0, Math.ceil(endTimestampMs / 1000) + 1);
      queryStr += ` after:${startEpochSec} before:${endEpochSec}`;
    } else if (isBackfillMode) {
      if (!mailbox.lastSyncedAt && !mailbox.backfillPageToken) {
        const initialWindowMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const epoch = Math.max(0, Math.floor(initialWindowMs / 1000));
        queryStr += ` after:${epoch}`;
      }
    } else {
      let effectiveSinceMs = null;
      if (mailbox.lastSyncedAt) {
        // 60-second overlap buffer to prevent missing in-flight emails or clock skew
        effectiveSinceMs = mailbox.lastSyncedAt.getTime() - 60000;
      } else {
        effectiveSinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      }

      // Check for oldest unrecovered FAILED event to make sure failures remain retryable
      try {
        const oldestFailed = await resumeRepository.findOldestFailedInboundEvent(mailbox.email);
        const failedDate = oldestFailed?.receivedAt || oldestFailed?.createdAt;
        if (failedDate) {
          const failedSinceMs = new Date(failedDate).getTime() - 60000;
          effectiveSinceMs = Math.min(effectiveSinceMs, failedSinceMs);
        }
      } catch (_) {}

      const epoch = Math.max(0, Math.floor(effectiveSinceMs / 1000));
      queryStr += ` after:${epoch}`;
    }

    let hasUnresolvedFailures = false;
    if (!isCustomDateRange) {
      try {
        const failedCount = await resumeRepository.countUnrecoveredFailedInboundEvents(mailbox.email);
        hasUnresolvedFailures = failedCount > 0;
      } catch (_) {}
    }

    const BATCH_CONCURRENCY = parseInt(process.env.MAILBOX_SYNC_CONCURRENCY, 10) || 3;
    const MAX_PAGES_PER_SYNC = parseInt(process.env.MAILBOX_MAX_PAGES_PER_SYNC, 10) || 5;
    const GMAIL_PAGE_MAX_RESULTS = Math.min(
      parseInt(process.env.MAILBOX_GMAIL_MAX_RESULTS, 10) || 100,
      100
    );

    let pageToken = isCustomDateRange
      ? (customDateRange.pageToken || null)
      : (isBackfillMode ? (mailbox.backfillPageToken || null) : null);

    let pagesScanned = 0;
    const startTime = Date.now();

    let totalScanned = 0;
    let totalSkipped = 0;
    let totalSkippedOutOfRange = 0;
    let totalSkippedUnrelated = 0;
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
        maxResults: GMAIL_PAGE_MAX_RESULTS,
      };
      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      let res;
      try {
        res = await gmail.users.messages.list(listParams);
      } catch (listErr) {
        const msgLower = (listErr?.message || "").toLowerCase();
        const isInvalidPageToken =
          listErr?.code === 400 ||
          msgLower.includes("invalid pagetoken") ||
          msgLower.includes("pagetoken is invalid");

        if (isInvalidPageToken && pageToken) {
          console.warn(`[MailboxSync] Invalid or expired pageToken: ${pageToken}. Resetting backfill.`);
          await repository.updateMailboxSyncStatus(userId, { backfillPageToken: null });
          delete listParams.pageToken;
          res = await gmail.users.messages.list(listParams);
        } else {
          throw listErr;
        }
      }

      const messages = res.data.messages || [];

      if (messages.length === 0) {
        pageToken = null;
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
          const isInRange = (!startTimestampMs || !existingDate || existingDate >= startTimestampMs) &&
                            (!endTimestampMs || !existingDate || existingDate <= endTimestampMs);
          if (isInRange && existingDate && (!highestSuccessInternalDate || existingDate > highestSuccessInternalDate)) {
            highestSuccessInternalDate = existingDate;
          }
        } else {
          actionableMsgs.push(msg);
        }
      }

      // In incremental mode, if every message in the page is already completed:
      if (actionableMsgs.length === 0 && !isCustomDateRange) {
        if (!isBackfillMode && !hasUnresolvedFailures) {
          break;
        }
      }

      // Process actionable messages with bounded concurrency
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
            customDateRange: isCustomDateRange
              ? {
                  ...customDateRange,
                  startTimestampMs,
                  endTimestampMs,
                }
              : null,
          });
        },
        BATCH_CONCURRENCY
      );

      for (const item of pageResults) {
        if (item.skipped) {
          totalSkipped++;
        }
        if (item.skippedOutOfRange) {
          totalSkippedOutOfRange++;
        }
        if (item.skippedUnrelated) {
          totalSkippedUnrelated++;
        }
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
          if (item.internalDate && !item.skippedOutOfRange) {
            const isInRange = (!startTimestampMs || item.internalDate >= startTimestampMs) &&
                              (!endTimestampMs || item.internalDate <= endTimestampMs);
            if (isInRange && (!highestSuccessInternalDate || item.internalDate > highestSuccessInternalDate)) {
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
      const isBacklogDrained = !pageToken;

      if (isBackfillMode) {
        if (isBacklogDrained) {
          newCheckpoint = highestSuccessInternalDate
            ? new Date(Math.max(existingLastSynced, highestSuccessInternalDate))
            : (mailbox.lastSyncedAt || new Date());

          await repository.updateMailboxSyncStatus(userId, {
            lastError: null,
            lastSyncedAt: newCheckpoint,
            backfillComplete: true,
            backfillPageToken: null,
          });
        } else {
          await repository.updateMailboxSyncStatus(userId, {
            lastError: null,
            backfillComplete: false,
            backfillPageToken: pageToken,
          });
        }
      } else {
        if (lowestFailureInternalDate) {
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
          backfillComplete: isBacklogDrained,
          backfillPageToken: pageToken || null,
        };

        await repository.updateMailboxSyncStatus(userId, syncStatusUpdate);
      }
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
      `[MailboxSync] Completed for ${mailbox.email} in ${durationMs}ms: scanned=${totalScanned}, skipped=${totalSkipped}, skippedUnrelated=${totalSkippedUnrelated}, newResumes=${totalProcessedResumes}, failed=${totalFailed}`
    );

    return {
      success: true,
      scanned: totalScanned,
      skipped: totalSkipped,
      skippedOutOfRange: totalSkippedOutOfRange,
      skippedUnrelated: totalSkippedUnrelated,
      processedResumes: totalProcessedResumes,
      failed: totalFailed,
      durationMs,
      lastSyncedAt: newCheckpoint || mailbox.lastSyncedAt,
      syncedAt: new Date(),
      nextPageToken: pageToken || undefined,
      backlogRemaining: Boolean(pageToken),
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


/**
 * Stream Candidate Resume on-demand from Gmail / Drive (Zero Disk Storage)
 * Downloads directly from Gmail/Google Drive into memory and streams to browser.
 * Zero local disk usage. Zero Supabase bucket storage required.
 */
async function getCandidateResumeStream({ candidateId, user }) {
  if (!candidateId) {
    throw badRequest("Candidate ID is required", "CANDIDATE_ID_REQUIRED");
  }

  // 1. Resolve Candidate
  const candidate = await prisma.candidateProfile.findFirst({
    where: {
      OR: [
        { id: candidateId },
        { userId: candidateId },
      ],
    },
  });

  if (!candidate) {
    throw notFound("Candidate profile not found", "CANDIDATE_NOT_FOUND");
  }

  // 2. Resolve providerMessageId & attachment metadata
  let providerMessageId = candidate.metadata?.providerMessageId || null;
  let attachmentId = candidate.metadata?.attachmentId || null;
  let driveFileId = candidate.metadata?.driveFileId || null;
  let fileName = candidate.metadata?.resumeFileName || null;
  let mimeType = candidate.metadata?.resumeMimeType || null;

  if (!providerMessageId) {
    // 1. Check via candidate.userId linked to ResumeProcessing
    if (candidate.userId) {
      const rp = await prisma.resumeProcessing.findFirst({
        where: { candidateId: candidate.userId },
        orderBy: { createdAt: "desc" },
      });
      if (rp) {
        fileName = fileName || rp.fileName;
        mimeType = mimeType || rp.mimeType;
        const linkedEvent = await prisma.inboundEmailEvent.findFirst({
          where: { resumeProcessingId: rp.id },
        });
        if (linkedEvent?.providerMessageId) {
          providerMessageId = linkedEvent.providerMessageId;
        }
      }
    }

    // 2. Direct search by candidate email substring in senderEmail or recipientEmail
    if (!providerMessageId && candidate.email) {
      const inboundEvent = await prisma.inboundEmailEvent.findFirst({
        where: {
          OR: [
            { senderEmail: { contains: candidate.email, mode: "insensitive" } },
            { recipientEmail: { contains: candidate.email, mode: "insensitive" } },
          ],
        },
        orderBy: { receivedAt: "desc" },
      });

      if (inboundEvent?.providerMessageId) {
        providerMessageId = inboundEvent.providerMessageId;
      }
    }

    // 3. Search via JobApplication if present
    if (!providerMessageId && candidate.userId) {
      const app = await prisma.jobApplication.findFirst({
        where: { candidateId: candidate.userId },
        include: { resumeProcessing: true },
        orderBy: { appliedAt: "desc" },
      });
      if (app?.resumeProcessing) {
        fileName = fileName || app.resumeProcessing.fileName;
        mimeType = mimeType || app.resumeProcessing.mimeType;
        const linkedEvent = await prisma.inboundEmailEvent.findFirst({
          where: { resumeProcessingId: app.resumeProcessing.id },
        });
        if (linkedEvent?.providerMessageId) {
          providerMessageId = linkedEvent.providerMessageId;
        }
      }
    }
  }

  if (!providerMessageId) {
    throw notFound(
      "No email record or attachment identifier found for this candidate.",
      "RESUME_NOT_FOUND"
    );
  }

  // 3. Resolve active UserMailbox for Google OAuth tokens
  let mailbox = null;
  if (user?.id) {
    mailbox = await repository.findMailboxByUserId(user.id);
  }

  if (!mailbox?.refreshToken && candidate.companyId) {
    const member = await prisma.companyMember.findFirst({
      where: { companyId: candidate.companyId, user: { mailbox: { isNot: null } } },
      include: { user: { include: { mailbox: true } } },
    });
    mailbox = member?.user?.mailbox;
  }

  if (!mailbox?.refreshToken) {
    mailbox = await prisma.userMailbox.findFirst({
      where: { isSyncActive: true, refreshToken: { not: "" } },
    });
  }

  if (!mailbox?.refreshToken) {
    throw badRequest(
      "No active Google Mailbox connected. Please connect your Gmail account to stream candidate resumes.",
      "MAILBOX_NOT_CONNECTED"
    );
  }

  // 4. Initialize Google OAuth Client & APIs
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: mailbox.refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let buffer = null;

  // Direct Attachment Fast-Path (cached attachmentId)
  if (attachmentId) {
    try {
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: providerMessageId,
        id: attachmentId,
      });
      const rawData = att.data?.data;
      if (rawData) {
        buffer = Buffer.from(rawData, "base64");
      }
    } catch (attErr) {
      console.warn("[ResumeStream] Cached attachment fetch failed, falling back to message parsing:", attErr.message);
    }
  }

  // Google Drive Fast-Path (cached driveFileId)
  if (!buffer && driveFileId) {
    try {
      const drive = driveService.createDriveClient(oauth2Client);
      const driveFile = await driveService.downloadDriveFile({ drive, fileId: driveFileId });
      buffer = driveFile.buffer;
      fileName = fileName || driveFile.originalname;
      mimeType = mimeType || driveFile.mimetype;
    } catch (driveErr) {
      console.warn("[ResumeStream] Cached drive file fetch failed, falling back to message parsing:", driveErr.message);
    }
  }

  // Fallback: Parse full Gmail message to discover attachments or drive links
  if (!buffer) {
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: providerMessageId,
    });

    const payload = fullMsg.data?.payload || {};
    const { attachments, plainTextBody, htmlBody } = driveService.extractMimeElements(payload);
    const driveFileIds = driveService.extractDriveFileIds(plainTextBody, htmlBody);

    if (attachments.length > 0) {
      const targetAtt = attachments.find((a) => /\.(pdf|docx|doc)$/i.test(a.filename)) || attachments[0];
      const attRes = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: providerMessageId,
        id: targetAtt.attachmentId,
      });

      const rawData = attRes.data?.data;
      if (rawData) {
        buffer = Buffer.from(rawData, "base64");
        attachmentId = targetAtt.attachmentId;
        fileName = targetAtt.filename;
        const ext = ("." + (targetAtt.filename.split(".").pop() || "")).toLowerCase();
        if (ext === ".pdf") mimeType = "application/pdf";
        else if (ext === ".docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === ".doc") mimeType = "application/msword";
        else mimeType = targetAtt.mimeType || "application/octet-stream";
      }
    } else if (driveFileIds.length > 0) {
      const drive = driveService.createDriveClient(oauth2Client);
      const driveFile = await driveService.downloadDriveFile({ drive, fileId: driveFileIds[0] });
      buffer = driveFile.buffer;
      driveFileId = driveFileIds[0];
      fileName = driveFile.originalname;
      mimeType = driveFile.mimetype;
    }

    // Persist discovered references in candidate metadata for instant subsequent lookups
    if (buffer && (attachmentId || driveFileId)) {
      try {
        const currentMeta = candidate.metadata && typeof candidate.metadata === "object" ? candidate.metadata : {};
        await prisma.candidateProfile.update({
          where: { id: candidate.id },
          data: {
            metadata: {
              ...currentMeta,
              providerMessageId,
              ...(attachmentId && { attachmentId }),
              ...(driveFileId && { driveFileId }),
              ...(fileName && { resumeFileName: fileName }),
              ...(mimeType && { resumeMimeType: mimeType }),
            },
          },
        });
      } catch (_saveErr) {}
    }
  }

  if (!buffer || buffer.length === 0) {
    throw notFound("Could not retrieve resume document from email", "RESUME_CONTENT_EMPTY");
  }

  const safeFileName = fileName || `${String(candidate.firstName || "Candidate").replace(/\s+/g, "_")}_Resume.pdf`;
  let safeMimeType = mimeType;
  if (!safeMimeType) {
    if (safeFileName.endsWith(".pdf")) safeMimeType = "application/pdf";
    else if (safeFileName.endsWith(".docx")) safeMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (safeFileName.endsWith(".doc")) safeMimeType = "application/msword";
    else safeMimeType = "application/pdf";
  }

  return {
    buffer,
    fileName: safeFileName,
    mimeType: safeMimeType,
  };
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
  resolveDateRangeBounds,
  getCandidateResumeStream,
};
