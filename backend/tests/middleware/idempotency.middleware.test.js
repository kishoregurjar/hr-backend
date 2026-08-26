"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../src/config/prisma");
const { createIdempotencyMiddleware } = require("../../src/middleware/idempotency.middleware");
const { markCompleted } = require("../../src/services/idempotency.service");

describe("Idempotency Middleware Suite", () => {
  const testKey1 = `mw-key-1-${Date.now()}`;
  const testKey2 = `mw-key-2-${Date.now()}`;

  after(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: {
        idempotencyKey: {
          in: [testKey1, testKey2],
        },
      },
    });
  });

  it("throws 400 when Idempotency-Key is missing and required: true", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "TEST_SCOPE",
      required: true,
    });

    const req = { get: () => null, headers: {} };
    let errorPassed = null;

    await middleware(req, {}, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.equal(errorPassed.statusCode, 400);
    assert.equal(errorPassed.code, "IDEMPOTENCY_KEY_REQUIRED");
  });

  it("calls next() when Idempotency-Key is missing and required: false", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "TEST_SCOPE",
      required: false,
    });

    const req = { get: () => null, headers: {} };
    let nextCalled = false;

    await middleware(req, {}, (err) => {
      if (!err) nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
  });

  it("throws 400 for empty or overly long Idempotency-Key", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "TEST_SCOPE",
      required: true,
    });

    // Empty key
    const reqEmpty = { get: () => "   ", headers: {} };
    let errEmpty = null;
    await middleware(reqEmpty, {}, (err) => {
      errEmpty = err;
    });
    assert.equal(errEmpty?.statusCode, 400);
    assert.equal(errEmpty?.code, "INVALID_IDEMPOTENCY_KEY");

    // Overly long key (> 128 chars)
    const longKey = "a".repeat(129);
    const reqLong = { get: () => longKey, headers: {} };
    let errLong = null;
    await middleware(reqLong, {}, (err) => {
      errLong = err;
    });
    assert.equal(errLong?.statusCode, 400);
    assert.equal(errLong?.code, "INVALID_IDEMPOTENCY_KEY");
  });

  it("reserves new idempotency key and attaches req.idempotency", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "ATTEMPT_SUBMIT",
      required: true,
    });

    const req = {
      get: () => testKey1,
      headers: {},
      method: "POST",
      originalUrl: "/api/v1/attempts/submit",
      body: { candidateToken: "tok_123" },
      user: { id: "user-test-1" },
    };

    let nextCalled = false;
    let nextError = null;

    await middleware(req, {}, (err) => {
      if (!err) nextCalled = true;
      else nextError = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextError, null);
    assert.ok(req.idempotency);
    assert.equal(req.idempotency.key, testKey1);
    assert.equal(req.idempotency.owner, true);
  });

  it("rejects concurrent request with same Idempotency-Key while PROCESSING", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "ATTEMPT_SUBMIT",
      required: true,
    });

    const req = {
      get: () => testKey1,
      headers: {},
      method: "POST",
      originalUrl: "/api/v1/attempts/submit",
      body: { candidateToken: "tok_123" },
      user: { id: "user-test-1" },
    };

    let errorPassed = null;
    await middleware(req, {}, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.equal(errorPassed.statusCode, 409);
    assert.equal(errorPassed.code, "IDEMPOTENCY_REQUEST_IN_PROGRESS");
  });

  it("replays cached response when request is COMPLETED", async () => {
    const middleware = createIdempotencyMiddleware({
      scope: "ATTEMPT_SUBMIT",
      required: true,
    });

    // Mark testKey1 as completed
    await markCompleted({
      idempotencyKey: testKey1,
      responseCode: 201,
      responseBody: { success: true, attemptId: "att_123" },
    });

    const req = {
      get: () => testKey1,
      headers: {},
      method: "POST",
      originalUrl: "/api/v1/attempts/submit",
      body: { candidateToken: "tok_123" },
      user: { id: "user-test-1" },
    };

    let statusSet = null;
    let jsonSent = null;

    const res = {
      status: (code) => {
        statusSet = code;
        return res;
      },
      json: (data) => {
        jsonSent = data;
        return res;
      },
    };

    await middleware(req, res, () => {});

    assert.equal(statusSet, 201);
    assert.deepEqual(jsonSent, { success: true, attemptId: "att_123" });
  });
});
