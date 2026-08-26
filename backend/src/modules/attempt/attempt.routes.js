const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");
const {
  otpSendRateLimiter,
  otpVerifyRateLimiter,
  startAttemptRateLimiter,
  saveAnswerRateLimiter,
  submitAttemptRateLimiter,
  adminRateLimiter,
} = require("../../middleware/rateLimit.middleware");

const attemptController = require("./attempt.controller");
const {
  attemptIdParamSchema,
  assessmentIdParamSchema,
  startAttemptSchema,
  createBulkInvitationSchema,
  startAttemptByTokenSchema,
  currentAttemptQuerySchema,
  saveAnswerSchema,
  submitAttemptSchema,
  assessmentResultsQuerySchema,
  attemptResultParamsSchema,
  sendCandidateOtpSchema,
  verifyCandidateOtpSchema,
  evaluateAttemptAnswerSchema,
  attemptResultQuerySchema,
  assessmentAnalyticsQuerySchema,
} = require("./attempt.validator");

/**
 * ==========================================================
 * Assessment Attempt Router
 * ==========================================================
 * Express Router definitions for Candidate Assessment Attempt lifecycle.
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * Base path: /api/v1/attempts
 * ==========================================================
 */

/**
 * Send Candidate Email OTP
 * POST /api/v1/attempts/candidate/send-otp
 * Public endpoint — Candidate OTP verification gate step 1
 */
router.post(
  "/candidate/send-otp",
  validateRequest({ body: sendCandidateOtpSchema }),
  otpSendRateLimiter,
  attemptController.sendCandidateOtp
);

/**
 * Verify Candidate Email OTP
 * POST /api/v1/attempts/candidate/verify-otp
 * Public endpoint — Candidate OTP verification gate step 2
 */
router.post(
  "/candidate/verify-otp",
  validateRequest({ body: verifyCandidateOtpSchema }),
  otpVerifyRateLimiter,
  attemptController.verifyCandidateOtp
);

const { requireCandidateVerification } = require("./attempt.session.middleware");

/**
 * Start Attempt By Invitation Token (Passwordless Entry Point)
 * POST /api/v1/attempts/start-by-token
 * Secured by Candidate Verification Session Bearer token
 */
router.post(
  "/start-by-token",
  startAttemptRateLimiter,
  requireCandidateVerification,
  validateRequest({ body: startAttemptByTokenSchema }),
  attemptController.startAttemptByToken
);

/**
 * Get Current Active Attempt State (Passwordless State Recovery Point)
 * GET /api/v1/attempts/current
 * Secured by Candidate Verification Session Bearer token
 */
router.get(
  "/current",
  requireCandidateVerification,
  validateRequest({ query: currentAttemptQuerySchema }),
  attemptController.getCurrentAttempt
);

/**
 * Real-Time Save Answer / Autosave Engine Point
 * POST /api/v1/attempts/save-answer
 * Secured by Candidate Verification Session Bearer token
 */
router.post(
  "/save-answer",
  requireCandidateVerification,
  saveAnswerRateLimiter,
  validateRequest({ body: saveAnswerSchema }),
  attemptController.saveAnswer
);

const { createIdempotencyMiddleware } = require("../../middleware/idempotency.middleware");

/**
 * Submit Attempt & Evaluation Engine Point
 * POST /api/v1/attempts/submit
 * Secured by Candidate Verification Session Bearer token
 */
router.post(
  "/submit",
  requireCandidateVerification,
  submitAttemptRateLimiter,
  validateRequest({ body: submitAttemptSchema }),
  createIdempotencyMiddleware({
    scope: "ATTEMPT_SUBMIT",
    required: false,
    ttlSeconds: 24 * 60 * 60,
  }),
  attemptController.submitAttempt
);

// Protected routes below require JWT authentication
router.use(requireAuth);

/**
 * Get Paginated HR Attempt Results List (HR / Super Admin)
 * GET /api/v1/attempts
 */
router.get(
  "/",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(attemptResultQuerySchema, "query"),
  attemptController.getHRAttemptResults
);

/**
 * Get Assessment Results List (HR / Super Admin)
 * GET /api/v1/attempts/assessments/:assessmentId/results
 */
router.get(
  "/assessments/:assessmentId/results",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema, "params"),
  validateRequest(assessmentResultsQuerySchema, "query"),
  attemptController.getAssessmentResults
);

/**
 * Get Assessment Real-Time Analytics Dashboard (HR / Super Admin)
 * GET /api/v1/attempts/assessments/:assessmentId/analytics
 */
router.get(
  "/assessments/:assessmentId/analytics",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema, "params"),
  validateRequest(assessmentAnalyticsQuerySchema, "query"),
  attemptController.getAssessmentAnalytics
);

/**
 * Get Detailed Candidate Attempt Result (HR / Super Admin)
 * GET /api/v1/attempts/assessments/:assessmentId/results/:attemptId
 */
router.get(
  "/assessments/:assessmentId/results/:attemptId",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(attemptResultParamsSchema, "params"),
  attemptController.getAttemptResultDetail
);

/**
 * Single Candidate Invitation Creation
 * POST /api/v1/attempts/assessments/:assessmentId/invitations
 */
router.post(
  "/assessments/:assessmentId/invitations",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  attemptController.createInvitation
);

/**
 * Bulk Candidate Invitation Creation
 * POST /api/v1/attempts/assessments/:assessmentId/invitations/bulk
 */
router.post(
  "/assessments/:assessmentId/invitations/bulk",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest({ body: createBulkInvitationSchema }),
  attemptController.createBulkInvitations
);

/**
 * Bulk Candidate Invitation Creation (Direct Path)
 * POST /api/v1/attempts/invitations/bulk
 */
router.post(
  "/invitations/bulk",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest({ body: createBulkInvitationSchema }),
  attemptController.createBulkInvitations
);

/**
 * Manual Subjective Answer Evaluation (HR / Super Admin)
 * POST /api/v1/attempts/:attemptId/evaluate-answer
 */
router.post(
  "/:attemptId/evaluate-answer",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(attemptIdParamSchema, "params"),
  validateRequest({ body: evaluateAttemptAnswerSchema }),
  attemptController.evaluateAnswer
);

/**
 * Start Candidate Assessment Attempt
 * POST /api/v1/attempts/:assessmentId/start
 */
router.post(
  "/:assessmentId/start",
  startAttemptRateLimiter,
  requireRole(AUTH_ROLES.CANDIDATE),
  validateRequest({
    params: assessmentIdParamSchema,
    body: startAttemptSchema,
  }),
  attemptController.startAttempt
);

/**
 * Get Detailed Attempt for HR Review (HR / Super Admin)
 * GET /api/v1/attempts/:attemptId
 */
router.get(
  "/:attemptId",
  adminRateLimiter,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(attemptIdParamSchema, "params"),
  attemptController.getHRAttemptDetail
);

module.exports = router;
