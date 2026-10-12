"use strict";

const { PrismaClient } = require("@prisma/client");
const { getDatabaseConfig } = require("./database.config");

const databaseConfig = getDatabaseConfig();

let databaseUrl = databaseConfig.url;
if (databaseUrl && !databaseUrl.includes("connection_limit")) {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  databaseUrl = `${databaseUrl}${separator}connection_limit=25&pool_timeout=10`;
}

const { wrapClientForMetrics, recordTransactionMetric } = require("./metrics-context");

const rawPrisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
  log: ["warn", "error"],
  errorFormat: process.env.NODE_ENV === "production" ? "minimal" : "pretty",
});

const prisma = wrapClientForMetrics(rawPrisma);

async function connectDatabase() {
  await prisma.$connect();
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

async function runTransaction(callback, options = {}) {
  const timeout = options.timeout ?? databaseConfig.transactionTimeoutMs;
  const maxWait = options.maxWait ?? databaseConfig.transactionMaxWaitMs;

  const start = performance.now();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const wrappedTx = wrapClientForMetrics(tx);
        return callback(wrappedTx);
      },
      {
        timeout,
        maxWait,
      }
    );
  } finally {
    recordTransactionMetric(performance.now() - start);
  }
}

module.exports = {
  prisma,
  databaseConfig,
  connectDatabase,
  disconnectDatabase,
  runTransaction,
};