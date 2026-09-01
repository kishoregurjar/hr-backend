"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const notFoundMiddleware = require("../../src/middleware/not-found.middleware");
const { AppError } = require("../../src/utils/app-error");

describe("404 Not Found Middleware Suite", () => {
  it("should forward NotFound AppError with ROUTE_NOT_FOUND code to next()", () => {
    const mockReq = {
      method: "GET",
      originalUrl: "/api/v1/unknown-endpoint",
    };

    let passedError = null;

    notFoundMiddleware(mockReq, {}, (err) => {
      passedError = err;
    });

    assert.ok(passedError instanceof AppError);
    assert.equal(passedError.statusCode, 404);
    assert.equal(passedError.code, "ROUTE_NOT_FOUND");
    assert.equal(passedError.message, "Route GET /api/v1/unknown-endpoint not found.");
  });
});
