"use strict";

const { RATE_LIMIT_POLICIES } = require("../config/rate-limit");
const { AppError, tooManyRequests } = require("../utils/app-error");
const { consumeRateLimit } = require("../utils/rate-limiter");
const { buildRateLimitKey, normalizeEmail } = require("../utils/rate-limit-key");

const crypto = require("node:crypto");

const createRateLimiter =
  ({ namespace, keyPrefix, windowSeconds, maxRequests, limit, keyGenerator, message, failOpen = true }) =>
  async (req, res, next) => {
    const effectiveNamespace = keyPrefix || namespace || "default";
    const effectiveLimit = limit || maxRequests || 100;
    const effectiveMessage = message || "Too many requests. Please try again later.";

    try {
      const identifier = keyGenerator(req);

      const key = buildRateLimitKey({
        namespace: effectiveNamespace,
        identifier,
      });

      const result = await consumeRateLimit({
        key,
        windowSeconds,
        maxRequests: effectiveLimit,
      });

      res.setHeader("X-RateLimit-Limit", String(effectiveLimit));

      res.setHeader("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfter));

        return next(
          tooManyRequests(
            effectiveMessage,
            "RATE_LIMIT_EXCEEDED"
          )
        );
      }

      return next();
    } catch (error) {
      console.error({
        type: "RATE_LIMITER_FAILURE",
        namespace: effectiveNamespace,
        message: error.message,
      });

      if (failOpen) {
        return next();
      }

      return next(
        new AppError(
          "Request protection service is temporarily unavailable.",
          {
            statusCode: 503,
            code: "RATE_LIMIT_SERVICE_UNAVAILABLE",
          }
        )
      );
    }
  };

const otpSendLimiter = createRateLimiter({
  namespace: "otp-send",
  ...RATE_LIMIT_POLICIES.OTP_SEND,
  failOpen: false,
  keyGenerator: (req) => {
    const email = req.validated?.body?.email || req.validatedData?.email || req.body?.email || "";
    return `${req.ip}:${normalizeEmail(email)}`;
  },
});

const otpVerifyLimiter = createRateLimiter({
  namespace: "otp-verify",
  ...RATE_LIMIT_POLICIES.OTP_VERIFY,
  failOpen: false,
  keyGenerator: (req) => {
    const email = req.validated?.body?.email || req.validatedData?.email || req.body?.email || "";
    return `${req.ip}:${normalizeEmail(email)}`;
  },
});

const startAttemptLimiter = createRateLimiter({
  namespace: "start-attempt",
  ...RATE_LIMIT_POLICIES.START_ATTEMPT,
  failOpen: true,
  keyGenerator: (req) => req.ip,
});

const saveAnswerLimiter = createRateLimiter({
  namespace: "save-answer",
  ...RATE_LIMIT_POLICIES.SAVE_ANSWER,
  failOpen: true,
  keyGenerator: (req) => {
    return req.candidateSession?.sessionId || req.candidateSession?.id || req.ip;
  },
});

const submitAttemptLimiter = createRateLimiter({
  namespace: "submit-attempt",
  ...RATE_LIMIT_POLICIES.SUBMIT_ATTEMPT,
  failOpen: true,
  keyGenerator: (req) => {
    return req.candidateSession?.sessionId || req.candidateSession?.id || req.ip;
  },
});

const adminApiLimiter = createRateLimiter({
  namespace: "admin-api",
  ...RATE_LIMIT_POLICIES.ADMIN_API,
  failOpen: false,
  keyGenerator: (req) => {
    return req.user?.id || req.user?.userId || req.ip;
  },
});

const ownerActivationRateLimit = createRateLimiter({
  keyPrefix: "owner-activation",
  limit: 10,
  windowSeconds: 15 * 60,
  keyGenerator: (req) => req.ip,
  message: "Too many activation attempts. Please try again later.",
});

const ownerActivationTokenLimit = createRateLimiter({
  keyPrefix: "owner-activation-token",
  limit: 5,
  windowSeconds: 15 * 60,
  keyGenerator: (req) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "missing";
    return crypto.createHash("sha256").update(token).digest("hex");
  },
  message: "Too many attempts for this activation link.",
});

const ownerActivationResendCompanyLimit = createRateLimiter({
  keyPrefix: "owner-activation-resend-company",
  limit: 5,
  windowSeconds: 60 * 60,
  keyGenerator: (req) => req.params?.companyId || "unknown-company",
  message: "Activation resend limit reached for this company.",
});

const ownerActivationResendAdminLimit = createRateLimiter({
  keyPrefix: "owner-activation-resend-admin",
  limit: 20,
  windowSeconds: 60 * 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: "Too many activation resend requests.",
});

module.exports = {
  createRateLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  startAttemptLimiter,
  saveAnswerLimiter,
  submitAttemptLimiter,
  adminApiLimiter,
  ownerActivationRateLimit,
  ownerActivationTokenLimit,
  ownerActivationResendCompanyLimit,
  ownerActivationResendAdminLimit,
};
