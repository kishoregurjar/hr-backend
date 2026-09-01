"use strict";

require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { consumeRateLimit } = require("../../src/utils/rate-limiter");

describe("Atomic Rate Limiter Suite", () => {
  it("should allow first request and enforce remaining count", async () => {
    const key = "test:ratelimit:first-req-" + Date.now();
    const res1 = await consumeRateLimit({
      key,
      windowSeconds: 60,
      maxRequests: 3,
    });

    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.current, 1);
    assert.strictEqual(res1.remaining, 2);
    assert.ok(res1.retryAfter > 0);
  });

  it("should allow requests within limit and reject when limit is reached", async () => {
    const key = "test:ratelimit:limit-check-" + Date.now();
    const maxRequests = 2;

    const res1 = await consumeRateLimit({ key, windowSeconds: 60, maxRequests });
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.remaining, 1);

    const res2 = await consumeRateLimit({ key, windowSeconds: 60, maxRequests });
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.remaining, 0);

    const res3 = await consumeRateLimit({ key, windowSeconds: 60, maxRequests });
    assert.strictEqual(res3.allowed, false);
    assert.strictEqual(res3.remaining, 0);
    assert.ok(res3.retryAfter > 0);
  });

  it("should handle concurrent requests atomically", async () => {
    const key = "test:ratelimit:concurrent-" + Date.now();
    const maxRequests = 10;

    const promises = Array.from({ length: 10 }, () =>
      consumeRateLimit({ key, windowSeconds: 60, maxRequests })
    );

    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    assert.strictEqual(allowedCount, 10);

    const overflowRes = await consumeRateLimit({ key, windowSeconds: 60, maxRequests });
    assert.strictEqual(overflowRes.allowed, false);
  });

  it("should isolate limits for different keys", async () => {
    const keyA = "test:ratelimit:keyA-" + Date.now();
    const keyB = "test:ratelimit:keyB-" + Date.now();

    await consumeRateLimit({ key: keyA, windowSeconds: 60, maxRequests: 1 });
    const resA = await consumeRateLimit({ key: keyA, windowSeconds: 60, maxRequests: 1 });

    assert.strictEqual(resA.allowed, false);

    const resB = await consumeRateLimit({ key: keyB, windowSeconds: 60, maxRequests: 1 });
    assert.strictEqual(resB.allowed, true);
  });
});
