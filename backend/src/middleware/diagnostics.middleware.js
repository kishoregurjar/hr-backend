"use strict";

const { randomUUID } = require("crypto");
const { metricsStorage } = require("../config/metrics-context");
const logger = require("../config/logger");

/**
 * Normalizes request route by stripping all tokens, UUIDs, IDs, and query parameters.
 */
function getNormalizedRoute(req) {
  const method = req.method || "GET";
  const path = (req.baseUrl || "") + (req.path || (req.url ? req.url.split("?")[0] : ""));

  if (path.endsWith("/save-answer")) {
    return `${method} /api/v1/attempts/save-answer`;
  }

  if (path.endsWith("/submit")) {
    if (path.includes("/assessment-attempts/")) {
      return `${method} /api/v1/assessment-attempts/:attemptId/submit`;
    }
    if (path.includes("/attempts/") && !path.endsWith("/attempts/submit")) {
      return `${method} /api/v1/attempts/:attemptId/submit`;
    }
    return `${method} /api/v1/attempts/submit`;
  }

  const sanitized = path
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":id")
    .replace(/c[a-z0-9]{24}/g, ":id")
    .replace(/att_[a-zA-Z0-9_-]+/g, ":id");

  return `${method} ${sanitized}`;
}

/**
 * Determines whether this route is in scope for diagnostic latency logging.
 */
function isTargetedRoute(req) {
  const path = (req.baseUrl || "") + (req.path || (req.url ? req.url.split("?")[0] : ""));
  return (
    req.method === "POST" &&
    (path.includes("/attempts/save-answer") ||
      path.includes("/attempts/submit") ||
      path.includes("/assessment-attempts/") ||
      path.endsWith("/save-answer") ||
      path.endsWith("/submit"))
  );
}

/**
 * Request Diagnostics Middleware
 * Establishes request-scoped context and logs structured performance metrics on completion.
 */
const diagnosticsMiddleware = (req, res, next) => {
  const targeted = isTargetedRoute(req);
  const startTime = performance.now();
  const requestId = req.requestId || req.headers?.["x-request-id"] || randomUUID();
  const route = getNormalizedRoute(req);

  const context = {
    requestId,
    route,
    isTargeted: targeted,
    startTime,
    prisma: {
      count: 0,
      cumulativeDurationMs: 0,
    },
    redis: {
      count: 0,
      durationMs: 0,
    },
    transaction: {
      durationMs: 0,
    },
    stages: {},
  };

  res.on("finish", () => {
    try {
      if (!context.isTargeted) return;

      const totalDurationMs = Number((performance.now() - context.startTime).toFixed(2));

      logger.info({
        event: "REQUEST_DIAGNOSTIC_METRICS",
        requestId: context.requestId,
        route: context.route,
        statusCode: res.statusCode,
        totalDurationMs,
        prisma: {
          count: context.prisma.count,
          cumulativeDurationMs: Number(context.prisma.cumulativeDurationMs.toFixed(2)),
        },
        redis: {
          count: context.redis.count,
          durationMs: Number(context.redis.durationMs.toFixed(2)),
        },
        stages: {
          sessionAuthMs: context.stages.sessionAuthMs !== undefined
            ? Number(context.stages.sessionAuthMs.toFixed(2))
            : undefined,
          sessionTouchMs: context.stages.sessionTouchMs !== undefined
            ? Number(context.stages.sessionTouchMs.toFixed(2))
            : undefined,
          saveCandidateAnswerMs: context.stages.saveCandidateAnswerMs !== undefined
            ? Number(context.stages.saveCandidateAnswerMs.toFixed(2))
            : undefined,
          submitCandidateAttemptMs: context.stages.submitCandidateAttemptMs !== undefined
            ? Number(context.stages.submitCandidateAttemptMs.toFixed(2))
            : undefined,
          submitTransactionMs: context.transaction.durationMs > 0
            ? Number(context.transaction.durationMs.toFixed(2))
            : undefined,
        },
      });
    } catch (_) {
      // Diagnostic logging failure must never affect request or error handling
    }
  });

  metricsStorage.run(context, () => {
    next();
  });
};

module.exports = {
  diagnosticsMiddleware,
  getNormalizedRoute,
  isTargetedRoute,
};
