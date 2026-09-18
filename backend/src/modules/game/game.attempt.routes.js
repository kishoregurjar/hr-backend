"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireCandidateVerification } = require("../attempt/attempt.session.middleware");
const controller = require("./game.attempt.controller");

const gameAuthGuard = async (req, res, next) => {
  try {
    return await requireCandidateVerification(req, res, (err) => {
      if (!err) {
        if (!req.user && req.candidateSession?.candidateId) {
          req.user = { id: req.candidateSession.candidateId };
        }
        return next();
      }
      return requireAuth(req, res, next);
    });
  } catch (_e) {
    return requireAuth(req, res, next);
  }
};

router.use(gameAuthGuard);

router.post(
  "/candidate-assessments/:candidateAssessmentId/games/:slug/start",
  controller.startGame
);

router.post(
  "/candidate-assessments/:candidateAssessmentId/games/attempts/:attemptId/submit",
  controller.submitGame
);

module.exports = router;
