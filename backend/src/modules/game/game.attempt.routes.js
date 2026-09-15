"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const controller = require("./game.attempt.controller");

router.use(requireAuth);

router.post(
  "/candidate-assessments/:candidateAssessmentId/games/:slug/start",
  controller.startGame
);

router.post(
  "/candidate-assessments/:candidateAssessmentId/games/attempts/:attemptId/submit",
  controller.submitGame
);

module.exports = router;
