"use strict";

const { RATE_LIMIT_POLICIES } = require("../config/rate-limit");
const { AppError, tooManyRequests } = require("../utils/app-error");
const { consumeRateLimit } = require("../utils/rate-limiter");
const { buildRateLimitKey, normalizeEmail } = require("../utils/rate-limit-key");

const createRateLimiter =
  ({ namespace, windowSeconds, maxRequests, keyGenerator, failOpen = true }) =>
  async (req, res, next) => {
    try {
      const identifier = keyGenerator(req);

      const key = buildRateLimitKey({
        namespace,
        identifier,
      });

      const result = await consumeRateLimit({
        key,
        windowSeconds,
        maxRequests,
      });

      res.setHeader("X-RateLimit-Limit", String(maxRequests));

      res.setHeader("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfter));

        return next(
          tooManyRequests(
            "Too many requests. Please try again later.",
            "RATE_LIMIT_EXCEEDED"
          )
        );
      }

      return next();
    } catch (error) {
      console.error({
        type: "RATE_LIMITER_FAILURE",
        namespace,
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

module.exports = {
  createRateLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  startAttemptLimiter,
  saveAnswerLimiter,
  submitAttemptLimiter,
  adminApiLimiter,
};
