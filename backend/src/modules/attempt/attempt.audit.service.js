"use strict";

const attemptAuditRepository = require("./attempt.audit.repository");

const SENSITIVE_KEYS = new Set([
  "token",
  "tokenHash",
  "otp",
  "otpHash",
  "password",
  "passwordHash",
  "authorization",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "secret",
]);

const sanitizeMetadata = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  const sanitized = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }

    sanitized[key] = sanitizeMetadata(entryValue);
  }

  return sanitized;
};

const recordAttemptAudit = async ({
  event,
  attemptId,
  candidateId,
  assessmentId,
  questionId,
  metadata,
  ipAddress,
  userAgent,
  tx,
}) => {
  return attemptAuditRepository.createAttemptAuditLog({
    event,
    attemptId,
    candidateId,
    assessmentId,
    questionId,
    metadata: sanitizeMetadata(metadata),
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    tx,
  });
};

const recordSecurityEvent = async ({
  event,
  attemptId = null,
  candidateId = null,
  assessmentId = null,
  questionId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}) => {
  return attemptAuditRepository.createAttemptAuditLog({
    event,
    attemptId,
    candidateId,
    assessmentId,
    questionId,
    metadata: sanitizeMetadata(metadata),
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    tx: null,
  });
};

module.exports = {
  recordAttemptAudit,
  recordSecurityEvent,
  sanitizeMetadata,
};
