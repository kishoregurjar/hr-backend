"use strict";

const { PrismaClient } = require("@prisma/client");
const { getDatabaseConfig } = require("./database.config");

const databaseConfig = getDatabaseConfig();

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? [
          {
            emit: "event",
            level: "query",
          },
          "warn",
          "error",
        ]
      : ["warn", "error"],

  errorFormat:
    process.env.NODE_ENV === "production" ? "minimal" : "pretty",
});

if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (event) => {
    const threshold = Number(process.env.DATABASE_SLOW_QUERY_MS || 500);

    if (Number.isFinite(threshold) && event.duration >= threshold) {
      console.warn(
        JSON.stringify({
          event: "database.slow_query",
          durationMs: event.duration,
          target: event.target,
        })
      );
    }
  });
}

async function connectDatabase() {
  await prisma.$connect();
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

async function runTransaction(callback, options = {}) {
  const timeout = options.timeout ?? databaseConfig.transactionTimeoutMs;
  const maxWait = options.maxWait ?? databaseConfig.transactionMaxWaitMs;

  return prisma.$transaction(
    async (tx) => {
      return callback(tx);
    },
    {
      timeout,
      maxWait,
    }
  );
}

module.exports = {
  prisma,
  databaseConfig,
  connectDatabase,
  disconnectDatabase,
  runTransaction,
};