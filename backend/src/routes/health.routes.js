"use strict";

const express = require("express");
const { getDatabaseHealth } = require("../services/database.health.service");

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
 * Readiness Probe: Checks if DB is reachable and application can serve traffic
 * GET /health/ready
 */
router.get("/ready", async (req, res) => {
  const dbHealth = await getDatabaseHealth();

  if (dbHealth.status === "healthy") {
    return res.status(200).json({
      success: true,
      status: "ready",
      dependencies: {
        database: dbHealth,
      },
    });
  }

  return res.status(503).json({
    success: false,
    status: "not_ready",
    dependencies: {
      database: dbHealth,
    },
  });
});

module.exports = router;
