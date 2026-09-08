const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { SuccessResponse } = require("../common/response");

const authRoutes = require("../modules/auth");
const assessmentRoutes = require("../modules/assessment");
const questionRoutes = require("../modules/question");
const categoryRoutes = require("../modules/category");
const tagRoutes = require("../modules/tag");
const attemptRoutes = require("../modules/attempt");
const { resumeRoutes } = require("../modules/resume");
const gameRoutes = require("../modules/game");
const mailboxRoutes = require("../modules/mailbox");
const companyRoutes = require("../modules/company");
const companyInvitationRoutes = require("../modules/company/company.invitation.routes");
const companyLogoRoutes = require("../modules/company/company.logo.routes");
const dashboardRoutes = require("../modules/dashboard");

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
 * Dashboard Overview Module Routes (/api/v1/dashboard)
 */
router.use("/dashboard", dashboardRoutes);

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
router.use("/candidates/sync-emails", mailboxRoutes);
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
 * Resume Parsing & Inbound Email Extraction Routes (/api/v1/resumes)
 */
router.use("/resumes", resumeRoutes);

/**
 * Game Module Routes (/api/v1/games)
 */
router.use("/games", gameRoutes);

/**
 * Google Mailbox Inbound Candidate Sync Routes (/api/v1/mailbox)
 */
router.use("/mailbox", mailboxRoutes);

/**
 * Company & Multi-tenant Organization Routes (/api/v1/companies)
 */
router.use("/companies", companyRoutes);
router.use("/companies", companyInvitationRoutes);
router.use("/companies", companyLogoRoutes);


module.exports = router;