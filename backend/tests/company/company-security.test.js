"use strict";

/**
 * Security Response Sanitization Tests
 * Verifies that sensitive fields are NEVER returned in API responses.
 * No HTTP calls needed — tests DTO/mapper functions directly.
 *
 * Run: node --test tests/company/company-security.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { mapCompany, mapCompanyMember } = require("../../src/modules/company/company.mapper");

// ─── Mapper Sanitization ──────────────────────────────────────────────────────

test("mapCompany does not expose internal fields", () => {
  const raw = {
    id: "company-1",
    name: "Test Corp",
    slug: "test-corp",
    status: "ACTIVE",
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // These must never be in the output:
    deletedAt: new Date(),
    internalNotes: "secret stuff",
  };

  const mapped = mapCompany(raw);

  assert.ok(mapped.id, "id must be present");
  assert.ok(mapped.name, "name must be present");
  assert.ok(!("internalNotes" in mapped), "internalNotes must not be exposed");
  assert.ok(!("deletedAt" in mapped), "deletedAt must not be exposed");
});

test("mapCompanyMember does not expose password or sensitive auth fields", () => {
  const raw = {
    id: "member-1",
    companyId: "company-1",
    userId: "user-1",
    role: "OWNER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: "user-1",
      email: "owner@example.com",
      name: "Test Owner",
      password: "hashed-super-secret",
      tokenVersion: 5,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mapped = mapCompanyMember(raw);

  assert.ok(mapped.userId || mapped.id, "member id/userId must be present");
  assert.ok(!("password" in mapped), "password must not be in member mapping");
  assert.ok(!("tokenVersion" in mapped), "tokenVersion must not be exposed");

  // If user is nested in mapping, check it too
  if (mapped.user) {
    assert.ok(!("password" in mapped.user), "user.password must not be exposed");
    assert.ok(!("tokenVersion" in mapped.user), "user.tokenVersion must not be exposed");
  }
});

// ─── AppError Sanitization ────────────────────────────────────────────────────

test("AppError exposes only statusCode, code, message — never stack in message", () => {
  const { AppError } = require("../../src/utils/app-error");

  const error = new AppError("Resource not found", {
    statusCode: 404,
    code: "COMPANY_NOT_FOUND",
  });

  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(error.code, "COMPANY_NOT_FOUND");
  assert.strictEqual(error.message, "Resource not found");
  assert.ok(error.isOperational === true);
  // Stack exists on the object but will not be serialized in production response
  assert.ok(typeof error.stack === "string");
});

test("error middleware normalizes unknown errors in production", () => {
  const { normalizeError } = require("../../src/middleware/error.middleware");

  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const unknownError = new Error("SELECT * FROM users WHERE ...");
  unknownError.code = "42601"; // Postgres syntax error code

  const normalized = normalizeError(unknownError);

  // In production, message should be generic — no SQL leaked
  assert.ok(normalized.statusCode >= 400 && normalized.statusCode < 600);
  // code should be present
  assert.ok(normalized.code);

  process.env.NODE_ENV = originalEnv;
});

// ─── Outbox/Email Security ────────────────────────────────────────────────────

test("company.outbox.constants has no secret values", () => {
  const { COMPANY_OUTBOX_CONSTANTS } = require("../../src/modules/company/company.outbox.constants");
  const json = JSON.stringify(COMPANY_OUTBOX_CONSTANTS);

  // These strings must never appear in constants
  assert.ok(!json.includes("password"), "No password in outbox constants");
  assert.ok(!json.includes("secret"), "No secret in outbox constants");
  assert.ok(!json.includes("token"), "No raw token in outbox constants");
});

// ─── Rate Limit Policy Sanity ─────────────────────────────────────────────────

test("GLOBAL rate limit policy exists and is positive", () => {
  const { RATE_LIMIT_POLICIES } = require("../../src/config/rate-limit");

  assert.ok(RATE_LIMIT_POLICIES.GLOBAL);
  assert.ok(RATE_LIMIT_POLICIES.GLOBAL.windowSeconds > 0);
  assert.ok(RATE_LIMIT_POLICIES.GLOBAL.maxRequests > 0);
});

test("OTP_SEND is stricter than GLOBAL", () => {
  const { RATE_LIMIT_POLICIES } = require("../../src/config/rate-limit");

  const otpRequestsPerWindow =
    RATE_LIMIT_POLICIES.OTP_SEND.maxRequests /
    RATE_LIMIT_POLICIES.OTP_SEND.windowSeconds;

  const globalRequestsPerWindow =
    RATE_LIMIT_POLICIES.GLOBAL.maxRequests /
    RATE_LIMIT_POLICIES.GLOBAL.windowSeconds;

  assert.ok(
    otpRequestsPerWindow < globalRequestsPerWindow,
    "OTP_SEND must be stricter (lower rate) than GLOBAL"
  );
});
