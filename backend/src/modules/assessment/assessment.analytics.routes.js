"use strict";

const express = require("express");

const controller = require("./assessment.analytics.controller");

const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

router.get(
  "/:assessmentId/analytics",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  controller.getOverview
);

router.get(
  "/:assessmentId/results/summary",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  controller.getOverview
);

router.get(
  "/:assessmentId/results/distribution",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  controller.getDistribution
);

router.get(
  "/:assessmentId/games/analytics",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  controller.getGames
);

router.get(
  "/:assessmentId/questions/analytics",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  controller.getQuestions
);

module.exports = router;
