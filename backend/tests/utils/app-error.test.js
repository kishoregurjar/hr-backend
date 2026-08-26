"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
} = require("../../src/utils/app-error");

describe("AppError Utility & Factory Helpers Suite", () => {
  it("creates an operational application error", () => {
    const error = new AppError("Invalid request.", {
      statusCode: 400,
      code: "INVALID_REQUEST",
    });

    assert.equal(error.message, "Invalid request.");
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "INVALID_REQUEST");
    assert.equal(error.isOperational, true);
  });

  it("creates a conflict error", () => {
    const error = conflict("Already exists.", "DUPLICATE_RESOURCE");

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "DUPLICATE_RESOURCE");
  });

  it("creates an unauthorized error", () => {
    const error = unauthorized();

    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "UNAUTHORIZED");
  });

  it("creates a bad request error", () => {
    const error = badRequest("Invalid input.", "VALIDATION_ERROR");

    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
  });

  it("should create AppError with default properties", () => {
    const error = new AppError("Default error message");

    assert.equal(error.message, "Default error message");
    assert.equal(error.name, "AppError");
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, "INTERNAL_SERVER_ERROR");
    assert.equal(error.details, null);
    assert.equal(error.isOperational, true);
    assert.ok(error.stack);
  });

  it("should create AppError with custom properties", () => {
    const error = new AppError("Assessment attempt has expired.", {
      statusCode: 409,
      code: "ATTEMPT_EXPIRED",
      details: { attemptId: "att_123" },
      isOperational: true,
    });

    assert.equal(error.message, "Assessment attempt has expired.");
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "ATTEMPT_EXPIRED");
    assert.deepEqual(error.details, { attemptId: "att_123" });
    assert.equal(error.isOperational, true);
  });

  it("should capture V8 stack trace properly", () => {
    const error = new AppError("Trace error");
    assert.ok(typeof error.stack === "string");
    assert.ok(error.stack.includes("AppError: Trace error"));
  });

  it("should create forbidden error (HTTP 403)", () => {
    const err = forbidden();
    assert.equal(err.statusCode, 403);
    assert.equal(err.code, "FORBIDDEN");
    assert.equal(err.message, "You do not have permission to perform this action.");
  });

  it("should create notFound error (HTTP 404)", () => {
    const err = notFound("Candidate not found.");
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "RESOURCE_NOT_FOUND");
    assert.equal(err.message, "Candidate not found.");
  });

  it("should create tooManyRequests error (HTTP 429)", () => {
    const err = tooManyRequests();
    assert.equal(err.statusCode, 429);
    assert.equal(err.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(err.message, "Too many requests.");
  });
});
