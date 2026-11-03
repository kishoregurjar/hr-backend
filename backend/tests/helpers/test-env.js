"use strict";

/**
 * =============================================================================
 * HireQuest Test Environment Loader (Fail-Closed Safety Configuration)
 * File: backend/tests/helpers/test-env.js
 * =============================================================================
 * Mandatory Isolation Invariants:
 * 1. Requires an explicit ".env.test" file for database integration tests.
 * 2. Strictly forbids silent fallback to development/production credentials from ".env".
 * 3. Enforces NODE_ENV="test" and verifies database connection string is NOT production.
 * 4. Disables background mailbox sync (FEATURE_MAILBOX_SYNC_ENABLED="false").
 * 5. Points outbound email to loopback sink (127.0.0.1:1025) to avoid accidental
 *    internet delivery. Note: this does not mock nodemailer; tests calling
 *    sendEmail directly must supply their own test mock or local sink.
 * =============================================================================
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const testEnvPath = path.join(rootDir, ".env.test");

if (!fs.existsSync(testEnvPath)) {
  if (process.env.ALLOW_DEV_DATABASE_TESTS === "true") {
    const mainEnvPath = path.join(rootDir, ".env");
    console.warn("\n[WARN] .env.test missing. ALLOW_DEV_DATABASE_TESTS=true: Loading development .env.");
    if (fs.existsSync(mainEnvPath)) {
      dotenv.config({ path: mainEnvPath });
    }
  } else {
    throw new Error(
      `\n[FATAL TEST MISCONFIGURATION] Missing required ".env.test" file.\n` +
      `Integration tests are blocked from silently falling back to development credentials in ".env".\n` +
      `To run database integration tests safely:\n` +
      `  1. Create a dedicated test database (e.g. hirequest_test or hirequest_staging).\n` +
      `  2. Create .env.test with DATABASE_URL pointing to the dedicated test database.\n` +
      `  3. Or set ALLOW_DEV_DATABASE_TESTS=true if local dev testing is explicitly intended.\n`
    );
  }
} else {
  // Load strictly from .env.test — never pollute from .env
  dotenv.config({ path: testEnvPath });
}

// Force NODE_ENV=test
process.env.NODE_ENV = "test";

// Enforce target database safety check on connection strings
const dbUrl = (process.env.DATABASE_URL || "").toLowerCase();
const directUrl = (process.env.DIRECT_URL || "").toLowerCase();

if (
  dbUrl.includes("prod") ||
  dbUrl.includes("production") ||
  dbUrl.includes("live") ||
  directUrl.includes("prod") ||
  directUrl.includes("production") ||
  directUrl.includes("live")
) {
  throw new Error("[FATAL] Integration tests cannot run against a PRODUCTION database URL!");
}

// Mailbox worker killswitch: enforce disabled
process.env.FEATURE_MAILBOX_SYNC_ENABLED = "false";

// Non-sensitive test defaults
process.env.PORT = process.env.PORT || "4001";
process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
process.env.OWNER_ACTIVATION_ENCRYPTION_KEY =
  process.env.OWNER_ACTIVATION_ENCRYPTION_KEY ||
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Outbound email sink configuration (loopback sink to avoid internet transmission)
process.env.BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || "127.0.0.1";
process.env.BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT || "1025";
process.env.BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || "test";
process.env.BREVO_SMTP_PASSWORD = process.env.BREVO_SMTP_PASSWORD || "test-password";
process.env.MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "no-reply@example.com";
process.env.MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "HireQuest Test";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:3000";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

module.exports = {};


