"use strict";

const {
  startAttemptExpiryJob,
  stopAttemptExpiryJob,
} = require("../jobs/attempt-expiry.job");
const { prisma } = require("../config/prisma");

startAttemptExpiryJob();

console.log("Attempt expiry worker started.");

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down expiry worker.`);

  stopAttemptExpiryJob();

  await prisma.$disconnect();

  process.exit(0);
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
