"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { requestIdMiddleware } = require("../../src/middleware/request-id.middleware");

describe("Request ID Middleware Suite", () => {
  it("generates UUID when X-Request-ID is missing", () => {
    const req = { get: () => null };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    let nextCalled = false;

    requestIdMiddleware(req, res, () => { nextCalled = true; });

    assert.ok(req.requestId);
    assert.strictEqual(headers["X-Request-ID"], req.requestId);
    assert.strictEqual(nextCalled, true);
  });

  it("propagates valid incoming X-Request-ID header", () => {
    const incoming = "req-custom-12345";
    const req = { get: (name) => (name === "X-Request-ID" ? incoming : null) };
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };

    requestIdMiddleware(req, res, () => {});

    assert.strictEqual(req.requestId, incoming);
    assert.strictEqual(headers["X-Request-ID"], incoming);
  });
});
