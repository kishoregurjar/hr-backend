"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { companyContext } = require("../company/company.context.middleware");
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
  companyContext,
  controller.getAssessmentResults
);

router.get(
  "/candidate-assessments/:candidateAssessmentId/result/details",
  requireAuth,
  requireRole("SUPER_ADMIN", "HR"),
  companyContext,
  controller.getResultDetails
);

module.exports = router;
