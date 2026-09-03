const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { SuccessResponse } = require("../common/response");

const authRoutes = require("../modules/auth");
const assessmentRoutes = require("../modules/assessment");
const questionRoutes = require("../modules/question");
const categoryRoutes = require("../modules/category");
const tagRoutes = require("../modules/tag");
const attemptRoutes = require("../modules/attempt");
const gameRoutes = require("../modules/game");

const router = express.Router();

/**
 * ==========================================================
 * Centralized API Router (/api/v1)
 * ==========================================================
 * Connects all domain modules using clean index facades.
 * ==========================================================
 */

/**
 * Liveness & Health Check Endpoint
 * GET /api/v1/health
 */
router.get("/health", (req, res) => {
  return SuccessResponse.send(
    res,
    {
      message: "Server is healthy and running.",
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    },
    StatusCodes.OK
  );
});

/**
 * Auth Module Routes (/api/v1/auth)
 */
router.use("/auth", authRoutes);

/**
 * Assessment Module Routes (/api/v1/assessments)
 */
router.use("/assessments", assessmentRoutes);

/**
 * Assessment Attempt Module Routes (/api/v1/attempts)
 */
router.use("/attempts", attemptRoutes);

/**
 * Invitations Route Alias (/api/v1/invitations)
 */
router.use("/invitations", attemptRoutes);

/**
 * Candidates Route Alias (/api/v1/candidates)
 */
router.use("/candidates", attemptRoutes);

/**
 * Question Bank Module Routes (/api/v1/questions)
 */
router.use("/questions", questionRoutes);

/**
 * Question Category Module Routes (/api/v1/question-categories)
 */
router.use("/question-categories", categoryRoutes);

/**
 * Question Tag Module Routes (/api/v1/question-tags)
 */
router.use("/question-tags", tagRoutes);

/**
 * Game Module Routes (/api/v1/games)
 */
router.use("/games", gameRoutes);

module.exports = router;