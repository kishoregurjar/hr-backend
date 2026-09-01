"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { asyncHandler } = require("../../src/utils/async-handler");

describe("Async Handler Utility Suite", () => {
  it("should execute async handler and resolve successfully", async () => {
    let executed = false;
    const req = {};
    const res = {};
    const next = () => {};

    const handler = asyncHandler(async (req, res) => {
      executed = true;
    });

    await handler(req, res, next);
    assert.equal(executed, true);
  });

  it("should catch async promise rejections and forward to next()", async () => {
    let forwardedError = null;
    const req = {};
    const res = {};
    const next = (err) => {
      forwardedError = err;
    };

    const handler = asyncHandler(async () => {
      throw new Error("Async failure");
    });

    await handler(req, res, next);
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, "Async failure");
  });
});
