"use strict";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getOptionalPositiveInteger(name, defaultValue) {
  const raw = process.env[name];

  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function getDatabaseConfig() {
  const databaseUrl = getRequiredEnv("DATABASE_URL");

  return Object.freeze({
    url: databaseUrl,

    connectionLimit: getOptionalPositiveInteger("DATABASE_CONNECTION_LIMIT", 10),

    connectionTimeoutMs: getOptionalPositiveInteger("DATABASE_CONNECTION_TIMEOUT_MS", 10000),

    transactionTimeoutMs: getOptionalPositiveInteger("DATABASE_TRANSACTION_TIMEOUT_MS", 15000),

    transactionMaxWaitMs: getOptionalPositiveInteger("DATABASE_TRANSACTION_MAX_WAIT_MS", 5000),
  });
}

module.exports = {
  getDatabaseConfig,
};
