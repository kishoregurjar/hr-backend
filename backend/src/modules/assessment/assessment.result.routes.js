"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const controller = require("./assessment.result.controller");

router.get(
  "/candidate-assessments/:candidateAssessmentId/result",
  requireAuth,
  controller.getCandidateResult
);

router.get(
  "/candidate-assessments/:candidateAssessmentId/attempts",
  requireAuth,
  controller.getCandidateAttempts
);

router.get(
  "/:assessmentId/results",
  requireAuth,
  requireRole("SUPER_ADMIN", "HR"),
  controller.getAssessmentResults
);

router.get(
  "/candidate-assessments/:candidateAssessmentId/result/details",
  requireAuth,
  requireRole("SUPER_ADMIN", "HR"),
  controller.getResultDetails
);

module.exports = router;
