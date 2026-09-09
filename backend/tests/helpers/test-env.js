"use strict";

/**
 * Test environment loader.
 *
 * Strategy:
 *  1. Load main .env first — provides real DATABASE_URL, Redis, SMTP etc.
 *  2. Override with .env.test values if that file exists.
 *  3. Set NODE_ENV=test so app code knows it is running under tests.
 *
 * This means integration tests automatically use the real dev database
 * without needing a separate test database setup.
 *
 * WARNING: integration tests will write/delete data in the dev database.
 * All integration tests call cleanDatabase() in beforeEach to isolate state.
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");

// Step 1 — load main .env (provides real credentials)
const mainEnvPath = path.join(rootDir, ".env");
if (fs.existsSync(mainEnvPath)) {
  dotenv.config({ path: mainEnvPath });
}

// Step 2 — override with .env.test if present
const testEnvPath = path.join(rootDir, ".env.test");
if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath, override: true });
}

// Step 3 — force NODE_ENV=test regardless
process.env.NODE_ENV = "test";

// Step 4 — fill any still-missing non-sensitive test defaults
process.env.PORT = process.env.PORT || "4001";
// DIRECT_URL is required by schema.prisma for Supabase — fall back to DATABASE_URL
process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
process.env.OWNER_ACTIVATION_ENCRYPTION_KEY =
  process.env.OWNER_ACTIVATION_ENCRYPTION_KEY ||
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || "smtp.example.com";
process.env.BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT || "587";
process.env.BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || "test@example.com";
process.env.BREVO_SMTP_PASSWORD = process.env.BREVO_SMTP_PASSWORD || "test-password";
process.env.MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "no-reply@example.com";
process.env.MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "HireQuest Test";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:3000";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

module.exports = {};

