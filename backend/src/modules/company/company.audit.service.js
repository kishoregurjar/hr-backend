"use strict";

const auditRepository = require("./company.audit.repository");

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "secret",
  "serviceRoleKey",
  "supabaseServiceRoleKey",
]);

const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_STRING_LENGTH = 500;

const sanitizeMetadata = (value, depth = 0) => {
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    const result = {};
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

    for (const [key, childValue] of entries) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = "[REDACTED]";
        continue;
      }

      result[key] = sanitizeMetadata(childValue, depth + 1);
    }

    return result;
  }

  return String(value);
};

const createAuditLog = async (
  {
    companyId = null,
    actorUserId = null,
    action,
    entityType,
    entityId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null,
  },
  tx
) => {
  const sanitizedMetadata =
    metadata === null ? null : sanitizeMetadata(metadata);

  return auditRepository.createAuditLog(
    {
      companyId,
      actorUserId,
      action,
      entityType,
      entityId,
      metadata: sanitizedMetadata,
      ipAddress,
      userAgent,
    },
    tx
  );
};

const createRequestAuditContext = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get("user-agent") || null,
});

const listAuditLogs = async (
  companyId,
  requesterRole,
  { page = 1, limit = 20 } = {}
) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [logs, total] = await Promise.all([
    auditRepository.findAuditLogs({
      companyId,
      skip,
      take: parsedLimit,
    }),
    auditRepository.countAuditLogs({
      companyId,
    }),
  ]);

  return {
    data: logs,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

module.exports = {
  createAuditLog,
  createRequestAuditContext,
  sanitizeMetadata,
  listAuditLogs,
};
