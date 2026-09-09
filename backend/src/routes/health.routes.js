"use strict";

const express = require("express");
const { getDatabaseHealth } = require("../services/database.health.service");
const { redisClient } = require("../config/redis");

const router = express.Router();

/**
 * Liveness Probe: Checks if the service process is alive
 * GET /health/live
 */
router.get("/live", (req, res) => {
  return res.status(200).json({
    success: true,
    status: "ok",
  });
});

/**
 * Readiness Probe: Checks if DB and Redis are reachable
 * Note: SMTP is intentionally NOT checked here — SMTP outage
 * should not remove the API from traffic; emails queue in Outbox.
 * GET /health/ready
 */
router.get("/ready", async (req, res) => {
  const dbHealth = await getDatabaseHealth();

  /*
   * Redis health check.
   */
  let redisStatus = "unhealthy";
  let redisLatencyMs = null;

  try {
    const redisStart = process.hrtime.bigint();
    await redisClient.ping();
    const redisElapsed = process.hrtime.bigint() - redisStart;
    redisLatencyMs = Number(Number(redisElapsed) / 1_000_000).toFixed(2);
    redisStatus = "healthy";
  } catch {
    redisStatus = "unhealthy";
  }

  const ready =
    dbHealth.status === "healthy" && redisStatus === "healthy";

  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ready" : "not_ready",
    dependencies: {
      database: dbHealth,
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs !== null ? Number(redisLatencyMs) : null,
      },
    },
  });
});

module.exports = router;
