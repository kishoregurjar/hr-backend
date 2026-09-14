"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const controller = require("./game.telemetry.controller");

router.use(requireAuth);

router.post(
  "/candidate-assessments/:candidateAssessmentId/games/attempts/:attemptId/telemetry",
  controller.recordTelemetry
);

module.exports = router;
