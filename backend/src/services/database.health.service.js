"use strict";

const { prisma } = require("../config/prisma");
const {
  pingDatabase,
  getDatabaseTime,
} = require("../repositories/database.health.repository");

async function getDatabaseHealth() {
  const startedAt = process.hrtime.bigint();

  try {
    await pingDatabase(prisma);

    const databaseTime = await getDatabaseTime(prisma);

    const elapsedNs = process.hrtime.bigint() - startedAt;

    const latencyMs = Number(elapsedNs) / 1_000_000;

    return {
      status: "healthy",
      latencyMs: Number(latencyMs.toFixed(2)),
      databaseTime,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: null,
      databaseTime: null,
    };
  }
}

module.exports = {
  getDatabaseHealth,
};
