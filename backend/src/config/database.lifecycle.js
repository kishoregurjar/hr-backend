"use strict";

const { prisma } = require("./prisma");

let connected = false;
let shuttingDown = false;

async function connectDatabase() {
  if (connected) {
    return;
  }

  if (shuttingDown) {
    throw new Error("Database is shutting down");
  }

  await prisma.$connect();
  connected = true;
}

async function disconnectDatabase() {
  if (!connected) {
    return;
  }

  shuttingDown = true;

  try {
    await prisma.$disconnect();
  } finally {
    connected = false;
  }
}

async function checkDatabaseHealth() {
  if (shuttingDown) {
    return {
      healthy: false,
      reason: "DATABASE_SHUTTING_DOWN",
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      healthy: true,
    };
  } catch (error) {
    return {
      healthy: false,
      reason: "DATABASE_UNAVAILABLE",
    };
  }
}

function isDatabaseConnected() {
  return connected;
}

function isDatabaseShuttingDown() {
  return shuttingDown;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth,
  isDatabaseConnected,
  isDatabaseShuttingDown,
};
