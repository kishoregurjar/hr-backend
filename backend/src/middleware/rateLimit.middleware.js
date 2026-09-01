"use strict";

const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { RATE_LIMIT_POLICIES } = require("../config/rate-limit");
const { redisClient } = require("../config/redis");
const { tooManyRequests } = require("../utils/app-error");
const { buildRateLimitKey, normalizeEmail } = require("../utils/rate-limit-key");

/**
 * Enterprise Rate Limit Store Factory
 * Configures RedisStore if redisClient is connected,
 * otherwise falls back gracefully to MemoryStore for dev/testing.
 */
const getStore = (prefix) => {
  if (redisClient && redisClient.isOpen) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: `hirequest:ratelimit:${prefix}:`,
    });
  }
  return undefined;
};

/**
 * Helper to build custom rate limiters with specific policies and key generators
 */
const createPolicyLimiter = ({
  policy,
  prefix,
  keyGenerator,
  message = "Too many requests. Please try again later.",
  code = "RATE_LIMIT_EXCEEDED",
}) =>
  rateLimit({
    windowMs: policy.windowSeconds * 1000,
    max: policy.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: getStore(prefix),
    validate: { trustProxy: false, keyGeneratorIpFallback: false },
    keyGenerator: (req) => {
      const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
      const identifier = keyGenerator ? keyGenerator(req, ip) : ip;
      return buildRateLimitKey({ namespace: prefix, identifier });
    },
    handler: (req, _res, next) => {
      return next(tooManyRequests(message, code));
    },
  });

/**
 * 1. Global Rate Limiter (IP)
 */
const globalRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.GLOBAL,
  prefix: "global",
  keyGenerator: (_req, ip) => ip,
  message: "Too many requests. Please try again later.",
});

/**
 * Helper function to safely extract validated email
 */
const extractEmail = (req) => {
  return (
    req.validated?.body?.email ||
    req.validatedData?.email ||
    req.body?.email ||
    req.body?.candidateEmail ||
    ""
  );
};

/**
 * 2. OTP Send Rate Limiter (IP + Email)
 */
const otpSendRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.OTP_SEND,
  prefix: "otp_send",
  keyGenerator: (req, ip) => {
    const rawEmail = extractEmail(req);
    return `${ip}:${normalizeEmail(rawEmail)}`;
  },
  message: "Too many OTP send requests. Please wait a minute.",
  code: "OTP_RATE_LIMITED",
});

/**
 * 3. OTP Verify Rate Limiter (IP + Email)
 */
const otpVerifyRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.OTP_VERIFY,
  prefix: "otp_verify",
  keyGenerator: (req, ip) => {
    const rawEmail = extractEmail(req);
    return `${ip}:${normalizeEmail(rawEmail)}`;
  },
  message: "Too many OTP verification attempts. Please try again after 5 minutes.",
  code: "OTP_RATE_LIMITED",
});

/**
 * 4. Start Attempt Rate Limiter (IP + Verification Session)
 */
const startAttemptRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.START_ATTEMPT,
  prefix: "start_attempt",
  keyGenerator: (req, ip) => {
    const session =
      (req.candidateSession && (req.candidateSession.id || req.candidateSession.tokenHash)) ||
      req.headers["x-candidate-session"] ||
      (req.body && req.body.invitationToken) ||
      "anon";
    return `${ip}:${session}`;
  },
  message: "Too many attempt start requests. Please try again later.",
});

/**
 * 5. Save Answer Rate Limiter (IP + Verification Session)
 */
const saveAnswerRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.SAVE_ANSWER,
  prefix: "save_answer",
  keyGenerator: (req, ip) => {
    const session =
      (req.candidateSession && (req.candidateSession.id || req.candidateSession.tokenHash)) ||
      req.headers["x-candidate-session"] ||
      (req.body && req.body.invitationToken) ||
      "anon";
    return `${ip}:${session}`;
  },
  message: "Rate limit exceeded for autosaving answers. Please slow down.",
});

/**
 * 6. Submit Attempt Rate Limiter (IP + Verification Session)
 */
const submitAttemptRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.SUBMIT_ATTEMPT,
  prefix: "submit_attempt",
  keyGenerator: (req, ip) => {
    const session =
      (req.candidateSession && (req.candidateSession.id || req.candidateSession.tokenHash)) ||
      req.headers["x-candidate-session"] ||
      (req.body && req.body.invitationToken) ||
      "anon";
    return `${ip}:${session}`;
  },
  message: "Too many attempt submit requests. Please try again later.",
});

/**
 * 7. Admin API Rate Limiter (UserId + IP)
 */
const adminRateLimiter = createPolicyLimiter({
  policy: RATE_LIMIT_POLICIES.ADMIN_API,
  prefix: "admin",
  keyGenerator: (req, ip) => {
    const userId = (req.user && (req.user.id || req.user.userId)) || "anon";
    return `${userId}:${ip}`;
  },
  message: "Too many administrative requests. Please slow down.",
});

module.exports = {
  globalRateLimiter,
  authRateLimiter: globalRateLimiter,
  otpSendRateLimiter,
  otpVerifyRateLimiter,
  startAttemptRateLimiter,
  saveAnswerRateLimiter,
  submitAttemptRateLimiter,
  adminRateLimiter,
};