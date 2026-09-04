"use strict";

const crypto = require("node:crypto");
const {
  MAX_RESUME_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ERROR_CODES,
} = require("./resume.constants");

function normalizeEmailAddress(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim().toLowerCase();
}

function isSupportedAttachment({ mimeType, size }) {
  return (
    ALLOWED_MIME_TYPES.includes(mimeType) &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= MAX_RESUME_SIZE_BYTES
  );
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

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizeInboundEmail(payload) {
  if (!payload || typeof payload !== "object") {
    const error = new Error(ERROR_CODES.RESUME_EMAIL_PAYLOAD_INVALID);
    error.statusCode = 400;
    error.code = ERROR_CODES.RESUME_EMAIL_PAYLOAD_INVALID;
    throw error;
  }

  const sender = normalizeEmailAddress(payload.from);
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const text = typeof payload.text === "string" ? payload.text : "";
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  return {
    sender,
    subject,
    text,
    attachments,
  };
}

function extractResumeAttachments(payload) {
  const normalized = normalizeInboundEmail(payload);

  return normalized.attachments.filter((attachment) => {
    if (!attachment) {
      return false;
    }

    return isSupportedAttachment({
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  });
}

module.exports = {
  normalizeEmailAddress,
  isSupportedAttachment,
  verifyWebhookSignature,
  normalizeInboundEmail,
  extractResumeAttachments,
};
