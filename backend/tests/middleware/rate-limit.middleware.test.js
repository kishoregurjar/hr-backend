"use strict";

require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createRateLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  startAttemptLimiter,
  saveAnswerLimiter,
  submitAttemptLimiter,
  adminApiLimiter,
} = require("../../src/middleware/rate-limit.middleware");

describe("Generic Rate Limiter Middleware Suite", () => {
  it("should attach rate limit headers and call next() when allowed", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-allowed-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 5,
      keyGenerator: (req) => req.ip,
    });

    const req = { ip: "127.0.0.1" };
    const headers = {};
    const res = {
      setHeader: (name, val) => {
        headers[name] = val;
      },
    };

    let nextCalled = false;
    let nextError = null;

    await limiter(req, res, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextError, undefined);
    assert.strictEqual(headers["X-RateLimit-Limit"], "5");
    assert.strictEqual(headers["X-RateLimit-Remaining"], "4");
  });

  it("should return AppError with HTTP 429 and Retry-After header when max requests are exceeded", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-exceeded-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 1,
      keyGenerator: (req) => req.ip,
    });

    const req = { ip: "192.168.1.1" };
    const headers = {};
    const res = {
      setHeader: (name, val) => {
        headers[name] = val;
      },
    };

    // First request - allowed
    await limiter(req, res, () => {});

    // Second request - exceeded
    let errorPassed = null;
    await limiter(req, res, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.strictEqual(errorPassed.statusCode, 429);
    assert.strictEqual(errorPassed.code, "RATE_LIMIT_EXCEEDED");
    assert.ok(headers["Retry-After"]);
    assert.strictEqual(headers["X-RateLimit-Remaining"], "0");
  });

  it("should isolate rate limits for OTP Email A vs OTP Email B", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-otp-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 1,
      keyGenerator: (req) => `${req.ip}:${req.body.email}`,
    });

    const res = { setHeader: () => {} };

    const reqEmailA = { ip: "10.0.0.1", body: { email: "candidateA@test.com" } };
    const reqEmailB = { ip: "10.0.0.1", body: { email: "candidateB@test.com" } };

    // Request for Candidate A - allowed
    let errorA1 = null;
    await limiter(reqEmailA, res, (err) => {
      errorA1 = err;
    });
    assert.strictEqual(errorA1, undefined);

    // Second Request for Candidate A - rate limited
    let errorA2 = null;
    await limiter(reqEmailA, res, (err) => {
      errorA2 = err;
    });
    assert.ok(errorA2);
    assert.strictEqual(errorA2.statusCode, 429);

    // Request for Candidate B (same IP, different email) - independent & allowed
    let errorB1 = null;
    await limiter(reqEmailB, res, (err) => {
      errorB1 = err;
    });
    assert.strictEqual(errorB1, undefined);
  });

  it("should isolate candidate session rate limits for same IP", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-session-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 1,
      keyGenerator: (req) => req.candidateSession?.sessionId || req.ip,
    });

    const res = { setHeader: () => {} };

    const reqCand1 = { ip: "203.0.113.1", candidateSession: { sessionId: "sess_cand_1" } };
    const reqCand2 = { ip: "203.0.113.1", candidateSession: { sessionId: "sess_cand_2" } };

    // Candidate 1 first request - allowed
    let err1 = null;
    await limiter(reqCand1, res, (err) => {
      err1 = err;
    });
    assert.strictEqual(err1, undefined);

    // Candidate 2 (same IP, different session) - independent & allowed
    let err2 = null;
    await limiter(reqCand2, res, (err) => {
      err2 = err;
    });
    assert.strictEqual(err2, undefined);
  });

  it("should fail open and call next() when failOpen is true and keyGenerator throws", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-fail-open-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 5,
      failOpen: true,
      keyGenerator: () => {
        throw new Error("Redis connection dropped");
      },
    });

    const req = {};
    const res = { setHeader: () => {} };

    let nextCalled = false;
    let nextError = null;

    await limiter(req, res, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextError, undefined);
  });

  it("should fail closed and pass AppError 503 to next() when failOpen is false and error occurs", async () => {
    const limiter = createRateLimiter({
      namespace: "unit-test-fail-closed-" + Date.now(),
      windowSeconds: 60,
      maxRequests: 5,
      failOpen: false,
      keyGenerator: () => {
        throw new Error("Strict rate limiter error");
      },
    });

    const req = {};
    const res = { setHeader: () => {} };

    let nextError = null;

    await limiter(req, res, (err) => {
      nextError = err;
    });

    assert.ok(nextError);
    assert.strictEqual(nextError.statusCode, 503);
    assert.strictEqual(nextError.code, "RATE_LIMIT_SERVICE_UNAVAILABLE");
  });

  it("should export all pre-configured rate limiter middleware instances", () => {
    assert.strictEqual(typeof otpSendLimiter, "function");
    assert.strictEqual(typeof otpVerifyLimiter, "function");
    assert.strictEqual(typeof startAttemptLimiter, "function");
    assert.strictEqual(typeof saveAnswerLimiter, "function");
    assert.strictEqual(typeof submitAttemptLimiter, "function");
    assert.strictEqual(typeof adminApiLimiter, "function");
  });
});
