"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const errorHandler = require("../../src/middleware/error.middleware");
const { errorMiddleware, logError } = require("../../src/middleware/error.middleware");
const notFoundMiddleware = require("../../src/middleware/not-found.middleware");
const { AppError } = require("../../src/utils/app-error");

const createMockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data) => {
    res.body = data;
    return res;
  };

  return res;
};

const mockReq = {
  id: "req_abc123",
  originalUrl: "/api/v1/test",
  method: "POST",
};

describe("Global Error Handler Middleware Suite", () => {
  let originalConsoleError;
  let loggedErrors = [];

  beforeEach(() => {
    loggedErrors = [];
    originalConsoleError = console.error;
    console.error = (data) => {
      loggedErrors.push(data);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("AppError -> correct status and code", () => {
    const error = new AppError("Assessment attempt was not found.", {
      statusCode: 404,
      code: "ATTEMPT_NOT_FOUND",
    });

    const res = createMockRes();
    errorMiddleware(error, mockReq, res, () => {});

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Assessment attempt was not found.");
    assert.equal(res.body.code, "ATTEMPT_NOT_FOUND");
    assert.equal(res.body.data, null);
    assert.deepEqual(res.body.meta, { requestId: "req_abc123" });
  });

  it("Unknown Error -> 500 INTERNAL_SERVER_ERROR", () => {
    const unknownErr = new Error("Something broke unexpectedly in database pool.");
    const res = createMockRes();

    errorMiddleware(unknownErr, mockReq, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "INTERNAL_SERVER_ERROR");
  });

  it("Production -> no stack or internal details leak", () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const sensitiveErr = new Error("Database network failure");
      sensitiveErr.stack = "Error: Database network failure at DB.connect (/src/db.js:42:10)";

      const res = createMockRes();
      errorMiddleware(sensitiveErr, mockReq, res, () => {});

      assert.equal(res.statusCode, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, "An unexpected server error occurred.");
      assert.equal(res.body.code, "INTERNAL_SERVER_ERROR");
      assert.equal(res.body.stack, undefined);
      assert.equal(res.body.details, undefined);
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it("404 -> ROUTE_NOT_FOUND", async () => {
    const req404 = {
      id: "req_abc123",
      method: "GET",
      originalUrl: "/api/v1/unknown-route",
    };
    let capturedError = null;

    notFoundMiddleware(req404, {}, (err) => {
      capturedError = err;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 404);
    assert.equal(capturedError.code, "ROUTE_NOT_FOUND");
  });

  it("Prisma P2002 -> 409 RESOURCE_ALREADY_EXISTS", () => {
    const prismaError = new Error("Unique constraint failed on the fields: (`email`)");
    prismaError.code = "P2002";
    prismaError.meta = { target: ["email"] };

    const res = createMockRes();
    errorHandler(prismaError, mockReq, res, () => {});

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "RESOURCE_ALREADY_EXISTS");
  });

  it("Prisma P2025 -> 404 RESOURCE_NOT_FOUND", () => {
    const prismaError = new Error("An operation failed because it depends on one or more records that were required but not found.");
    prismaError.code = "P2025";

    const res = createMockRes();
    errorHandler(prismaError, mockReq, res, () => {});

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "RESOURCE_NOT_FOUND");
  });

  it("should format Zod validation error correctly via normalizeError", () => {
    const zodError = new Error("Validation error");
    zodError.name = "ZodError";
    zodError.issues = [
      { path: ["body", "durationMinutes"], message: "Expected number, received string" },
    ];

    const res = createMockRes();
    errorHandler(zodError, mockReq, res, () => {});

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Request validation failed.");
    assert.equal(res.body.code, "VALIDATION_ERROR");
    assert.equal(res.body.data, null);
    assert.deepEqual(res.body.meta, { requestId: "req_abc123" });
    assert.deepEqual(res.body.details, [
      { field: "durationMinutes", message: "Expected number, received string" },
    ]);
  });

  it("should format JWT invalid token error correctly", () => {
    const jwtError = new Error("jwt malformed");
    jwtError.name = "JsonWebTokenError";

    const res = createMockRes();
    errorHandler(jwtError, mockReq, res, () => {});

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "INVALID_TOKEN");
  });

  it("should log errors cleanly via logError helper and NEVER log req.body or sensitive payloads", () => {
    const sensitiveReq = {
      ...mockReq,
      body: {
        password: "SuperSecretPassword123!",
        otp: "123456",
        token: "inv_secret_token",
        candidateData: { email: "candidate@example.com" },
        resumeInformation: "Sensitive Resume Content",
      },
    };
    const err = new Error("Test error for logger");
    logError(err, sensitiveReq);

    assert.equal(loggedErrors.length, 1);
    assert.equal(loggedErrors[0].requestId, "req_abc123");
    assert.equal(loggedErrors[0].method, "POST");
    assert.equal(loggedErrors[0].path, "/api/v1/test");
    assert.equal(loggedErrors[0].statusCode, 500);
    assert.equal(loggedErrors[0].message, "Test error for logger");
    assert.equal(loggedErrors[0].body, undefined);
    assert.equal(loggedErrors[0].password, undefined);
    assert.equal(loggedErrors[0].otp, undefined);
  });
});
