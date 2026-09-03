"use strict";

const express = require("express");
const { getMetricsSnapshot } = require("../utils/metrics");

const router = express.Router();

/**
 * Internal Production Metrics Snapshot Endpoint (Admin / Internal Monitoring system only)
 * GET /internal/metrics
 */
router.get("/metrics", (req, res) => {
  return res.status(200).json({
    success: true,
    data: getMetricsSnapshot(),
  });
});

module.exports = router;
