"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { getDatabaseConfig } = require("../../src/config/database.config");

describe("Database configuration suite", () => {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_CONNECTION_LIMIT: process.env.DATABASE_CONNECTION_LIMIT,
    DATABASE_TRANSACTION_TIMEOUT_MS: process.env.DATABASE_TRANSACTION_TIMEOUT_MS,
    DATABASE_TRANSACTION_MAX_WAIT_MS: process.env.DATABASE_TRANSACTION_MAX_WAIT_MS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("should require DATABASE_URL", () => {
    delete process.env.DATABASE_URL;

    assert.throws(
      () => getDatabaseConfig(),
      {
        message: "Missing required environment variable: DATABASE_URL",
      }
    );
  });

  it("should parse valid database configuration", () => {
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/hirequest";
    process.env.DATABASE_CONNECTION_LIMIT = "20";
    process.env.DATABASE_TRANSACTION_TIMEOUT_MS = "20000";
    process.env.DATABASE_TRANSACTION_MAX_WAIT_MS = "5000";

    const config = getDatabaseConfig();

    assert.equal(config.connectionLimit, 20);
    assert.equal(config.transactionTimeoutMs, 20000);
    assert.equal(config.transactionMaxWaitMs, 5000);
  });

  it("should reject invalid connection limit", () => {
    process.env.DATABASE_URL = "postgresql://localhost/hirequest";
    process.env.DATABASE_CONNECTION_LIMIT = "0";

    assert.throws(() => getDatabaseConfig());
  });
});
