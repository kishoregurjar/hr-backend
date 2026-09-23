"use strict";

const { PrismaClient } = require("@prisma/client");
const { getDatabaseConfig } = require("./database.config");

const databaseConfig = getDatabaseConfig();

let databaseUrl = databaseConfig.url;
if (databaseUrl && !databaseUrl.includes("connection_limit")) {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  databaseUrl = `${databaseUrl}${separator}connection_limit=25&pool_timeout=10`;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
  log: ["warn", "error"],
  errorFormat: process.env.NODE_ENV === "production" ? "minimal" : "pretty",
});

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