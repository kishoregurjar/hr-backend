"use strict";

const crypto = require("node:crypto");

const {
  INBOUND_EMAIL_PROVIDERS,
  INBOUND_SIGNATURE_MAX_AGE_SECONDS,
  MAX_INBOUND_ATTACHMENTS,
  MAX_RESUME_SIZE,
  ALLOWED_RESUME_MIME_TYPES,
  RESUME_ERROR_CODES,
  MAX_RESUME_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} = require("./resume.constants");

function createError(code, message, statusCode = 400) {
  const error = new Error(message);

  error.code = code;
  error.statusCode = statusCode;

  return error;
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }

  return trimmed;
}

function normalizeSubject(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

function normalizeFilename(value) {
  if (typeof value !== "string") {
    return "resume";
  }

  const basename = value
    .replace(/\\/g, "/")
    .split("/")
    .pop();

  return basename || "resume";
}

function safeEqualHex(expected, actual) {
  if (
    typeof expected !== "string" ||
    typeof actual !== "string"
  ) {
    return false;
  }

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(actual, "utf8")
  );
}

function verifyTimestamp(timestamp) {
  const parsed = Number(timestamp);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Invalid webhook timestamp."
    );
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    Math.abs(now - parsed) >
    INBOUND_SIGNATURE_MAX_AGE_SECONDS
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_EXPIRED,
      "Webhook signature has expired."
    );
  }
}

function verifyMailgunSignature({
  timestamp,
  token,
  signature,
  signingKey
}) {
  if (
    !timestamp ||
    !token ||
    !signature ||
    !signingKey
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Mailgun signature information is incomplete."
    );
  }

  verifyTimestamp(timestamp);

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`, "utf8")
    .digest("hex");

  if (!safeEqualHex(expected, signature)) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Invalid Mailgun webhook signature."
    );
  }

  return true;
}

function extractMailgunMessageId(payload) {
  const messageHeaders = payload["message-headers"];

  if (typeof messageHeaders === "string") {
    try {
      const parsed = JSON.parse(messageHeaders);

      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (
            Array.isArray(entry) &&
            String(entry[0]).toLowerCase() === "message-id"
          ) {
            return String(entry[1]).trim();
          }
        }
      }
    } catch {
      // Fall through to provider fields.
    }
  }

  return (
    payload["Message-Id"] ||
    payload["message-id"] ||
    payload["message_id"] ||
    payload["event-data"]?.id ||
    null
  );
}

function extractSendGridMessageId(fields) {
  const headers = fields?.headers;

  if (typeof headers === "string") {
    const messageIdMatch = headers.match(
      /^message-id\s*:\s*(.+)$/im
    );

    if (messageIdMatch) {
      return messageIdMatch[1].trim();
    }
  }

  return (
    fields?.["Message-ID"] ||
    fields?.["message-id"] ||
    fields?.messageId ||
    null
  );
}

function parseSendGridAttachments(req) {
  const files = Array.isArray(req.files)
    ? req.files
    : req.file
      ? [req.file]
      : [];

  return files.map((file) => ({
    filename: normalizeFilename(file.originalname),
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer
  }));
}

function parseMailgunAttachments(req) {
  const files = Array.isArray(req.files)
    ? req.files
    : req.file
      ? [req.file]
      : [];

  return files.map((file) => ({
    filename: normalizeFilename(file.originalname),
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer
  }));
}

function validateAttachments(attachments) {
  if (
    !Array.isArray(attachments) ||
    attachments.length === 0
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_PAYLOAD_INVALID,
      "Inbound email contains no attachments."
    );
  }

  if (attachments.length > MAX_INBOUND_ATTACHMENTS) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_ATTACHMENT_LIMIT,
      "Too many attachments in inbound email."
    );
  }

  for (const attachment of attachments) {
    if (!attachment.buffer || !Buffer.isBuffer(attachment.buffer)) {
      throw createError(
        RESUME_ERROR_CODES.INBOUND_PAYLOAD_INVALID,
        "Invalid attachment payload."
      );
    }

    const allowedMimes = ALLOWED_RESUME_MIME_TYPES || ALLOWED_MIME_TYPES || [];
    const maxLimit = MAX_RESUME_SIZE || MAX_RESUME_SIZE_BYTES || 5 * 1024 * 1024;

    if (attachment.size > maxLimit) {
      throw createError(
        RESUME_ERROR_CODES.INBOUND_ATTACHMENT_TOO_LARGE,
        "Resume attachment exceeds the maximum allowed size."
      );
    }

    if (!allowedMimes.includes(attachment.contentType)) {
      throw createError(
        RESUME_ERROR_CODES.INBOUND_ATTACHMENT_TYPE,
        "Unsupported resume attachment type."
      );
    }
  }
}

function parseSendGridInbound(req) {
  const fields = req.body || {};

  const attachments = parseSendGridAttachments(req);

  validateAttachments(attachments);

  const sender =
    normalizeEmail(fields.from) ||
    normalizeEmail(fields.sender);

  const recipient =
    normalizeEmail(fields.to) ||
    normalizeEmail(fields.recipient);

  const subject = normalizeSubject(fields.subject);

  const providerMessageId =
    extractSendGridMessageId(fields);

  if (!providerMessageId) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_MESSAGE_ID_REQUIRED,
      "SendGrid Message-ID is required."
    );
  }

  return {
    provider: INBOUND_EMAIL_PROVIDERS.SENDGRID,
    providerMessageId,
    senderEmail: sender,
    recipientEmail: recipient,
    subject,
    subjectCode: null,
    attachments
  };
}

function parseMailgunInbound(req, config = {}) {
  const fields = req.body || {};

  if (config.signingKey) {
    verifyMailgunSignature({
      timestamp: fields.timestamp,
      token: fields.token,
      signature: fields.signature,
      signingKey: config.signingKey
    });
  }

  const attachments = parseMailgunAttachments(req);

  validateAttachments(attachments);

  const sender =
    normalizeEmail(fields.from) ||
    normalizeEmail(fields.sender);

  const recipient =
    normalizeEmail(fields.recipient);

  const subject = normalizeSubject(fields.subject);

  const providerMessageId =
    extractMailgunMessageId(fields);

  if (!providerMessageId) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_MESSAGE_ID_REQUIRED,
      "Mailgun Message-ID is required."
    );
  }

  return {
    provider: INBOUND_EMAIL_PROVIDERS.MAILGUN,
    providerMessageId,
    senderEmail: sender,
    recipientEmail: recipient,
    subject,
    subjectCode: null,
    attachments
  };
}

function parseSesInbound({
  notification,
  attachments
}) {
  if (
    !notification ||
    notification.notificationType !== "Received"
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_PAYLOAD_INVALID,
      "Invalid SES receiving notification."
    );
  }

  const mail = notification.mail;

  if (!mail?.messageId) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_MESSAGE_ID_REQUIRED,
      "SES messageId is required."
    );
  }

  const headers =
    mail.commonHeaders || {};

  const sender =
    normalizeEmail(headers.from?.[0]);

  const recipient =
    normalizeEmail(headers.to?.[0]);

  const subject =
    normalizeSubject(headers.subject);

  validateAttachments(attachments);

  return {
    provider: INBOUND_EMAIL_PROVIDERS.SES,
    providerMessageId: mail.messageId,
    senderEmail: sender,
    recipientEmail: recipient,
    subject,
    subjectCode: null,
    attachments
  };
}

function verifySnsNotificationSignature(payload) {
  if (!payload || typeof payload !== "object") {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Invalid SNS notification payload."
    );
  }

  const signingCertUrl = payload.SigningCertURL || payload.SigningCertUrl;

  if (
    typeof signingCertUrl !== "string" ||
    !/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(signingCertUrl)
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Invalid SNS SigningCertURL domain."
    );
  }

  if (
    payload.SignatureVersion &&
    payload.SignatureVersion !== "1" &&
    payload.SignatureVersion !== "2"
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_SIGNATURE_INVALID,
      "Unsupported SNS SignatureVersion."
    );
  }

  return true;
}


function extractSubjectJobCode(subject) {
  if (!subject) {
    return null;
  }

  const patterns = [
    /\[(?:JOB|JOB-CODE)\s*:\s*([A-Z0-9_-]+)\]/i,
    /\bJOB(?:-CODE)?\s*[:#-]\s*([A-Z0-9_-]+)\b/i
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);

    if (match) {
      return match[1].trim().toUpperCase();
    }
  }

  return null;
}

function buildInboundEmailIdentity(payload) {
  return {
    ...payload,
    subjectCode:
      payload.subjectCode ||
      extractSubjectJobCode(payload.subject)
  };
}

// Backward compatibility helpers for pre-existing test suites
function isSupportedAttachment({ mimeType, size }) {
  if (
    ALLOWED_RESUME_MIME_TYPES.includes(mimeType) &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= MAX_RESUME_SIZE
  ) {
    return true;
  }
  return false;
}

function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !signature ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return safeEqualHex(expected, signature);
}

function normalizeInboundEmail(payload) {
  if (!payload || typeof payload !== "object") {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_PAYLOAD_INVALID,
      "Invalid inbound email payload"
    );
  }

  const sender = normalizeEmail(payload.from || payload.sender);
  const recipient = normalizeEmail(payload.to || payload.recipient);
  const subject = normalizeSubject(payload.subject);
  const text = typeof payload.text === "string" ? payload.text : "";
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  return {
    sender,
    recipient,
    subject,
    text,
    attachments,
  };
}

module.exports = {
  normalizeEmail,
  normalizeSubject,
  normalizeFilename,
  verifyMailgunSignature,
  verifySnsNotificationSignature,
  parseSendGridInbound,
  parseMailgunInbound,
  parseSesInbound,
  validateAttachments,
  extractSubjectJobCode,
  buildInboundEmailIdentity,
  // Backward compatibility exports
  normalizeEmailAddress: normalizeEmail,
  isSupportedAttachment,
  verifyWebhookSignature,
  normalizeInboundEmail,
};

