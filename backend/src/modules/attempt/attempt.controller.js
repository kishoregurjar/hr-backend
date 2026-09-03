const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { ATTEMPT_MESSAGES, ATTEMPT_ERRORS } = require("./attempt.constants");
const assessmentRepository = require("../assessment/assessment.repository");
const attemptService = require("./attempt.service");
const idempotencyService = require("../../services/idempotency.service");
const {
  toCandidateResponse,
  toInvitationResponse,
  toBulkInvitationResponse,
  toCandidateCurrentAttemptResponse,
  toCandidateAnswerResponse,
  toCandidateSubmissionResponse,
  toHRAttemptListResponse,
  toAssessmentAnalyticsResponse,
  toHRAttemptDetailResponse,
} = require("./attempt.dto");
const { UnauthorizedError, BadRequestError } = require("../../common/errors");

/**
 * ==========================================================
 * Enterprise Assessment Attempt Controller
 * ==========================================================
 * Express HTTP handlers for Candidate Attempt & Invitation endpoints.
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */
class AttemptController {
  /**
   * Start Assessment Attempt Handler
   * POST /api/v1/attempts/:assessmentId/start
   */
  startAttempt = asyncHandler(async (req, res) => {
    const candidateId = req.user?.id;
    if (!candidateId) {
      throw new UnauthorizedError(
        "Authenticated candidate identity is required.",
        ATTEMPT_ERRORS.OWNERSHIP_REQUIRED
      );
    }

    const { assessmentId } = req.params;
    if (!assessmentId) {
      throw new BadRequestError(
        "Assessment ID is required.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_FOUND
      );
    }

    const attempt = await attemptService.startAttempt({
      assessmentId,
      candidateId,
    });

    const responseData = toCandidateResponse(attempt);

    return SuccessResponse.send(
      res,
      {
        message: ATTEMPT_MESSAGES.CREATED || "Assessment attempt started successfully.",
        data: responseData,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Create Candidate Invitation Handler
   * POST /api/v1/assessments/:assessmentId/invitations
   */
  createInvitation = asyncHandler(async (req, res) => {
    const invitedByUserId = req.user?.id;
    let assessmentId = req.params.assessmentId || req.body.assessmentId;
    if (!assessmentId) {
      const latestResult = await assessmentRepository.listPaginated({ limit: 1 });
      assessmentId = latestResult?.items?.[0]?.id;
    }
    const { candidateId, email, firstName, lastName, expiresAt } = req.body;

    const result = await attemptService.createInvitation({
      assessmentId,
      candidateId,
      email,
      firstName,
      lastName,
      invitedByUserId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    const response = toInvitationResponse(result.invitation);

    return SuccessResponse.send(
      res,
      {
        message: "Invitation created successfully.",
        data: response,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Bulk Create Invitations Handler
   * POST /api/v1/assessments/:assessmentId/invitations/bulk
   * HTTP 207 Multi-Status response
   */
  createBulkInvitations = asyncHandler(async (req, res) => {
    const invitedByUserId = req.user?.id;
    if (!invitedByUserId) {
      throw new UnauthorizedError(
        "Authenticated user is required.",
        "AUTHENTICATION_REQUIRED"
      );
    }

    const { assessmentId } = req.params;
    const { candidateIds, candidates, expiresAt } = req.body;

    const result = await attemptService.createBulkInvitations({
      assessmentId,
      candidateIds,
      candidates,
      invitedByUserId,
      expiresAt,
    });

    const response = toBulkInvitationResponse(result);

    return res.status(207).json({
      success: true,
      message: "Bulk invitation processing completed.",
      data: response,
      meta: null,
    });
  });

  /**
   * Start Attempt By Invitation Token Handler
   * POST /api/v1/attempts/start-by-token
   * Passwordless Candidate Entry Point
   */
  startAttemptByToken = asyncHandler(async (req, res) => {
    const { token } = req.body || {};
    const candidateSession = req.candidateSession;

    const attempt = await attemptService.startAttemptByToken({
      token,
      candidateSession,
    });

    const response = toCandidateResponse(attempt);

    return SuccessResponse.send(
      res,
      {
        message: "Assessment attempt started successfully.",
        data: response,
      },
      StatusCodes.CREATED
    );
  });

  getCurrentAttempt = asyncHandler(async (req, res) => {
    const { token } = req.query || {};
    const candidateSession = req.candidateSession;

    const result = await attemptService.getCurrentCandidateAttempt({
      token,
      candidateSession,
    });

    if (!result) {
      return res.status(200).json({
        success: true,
        message: "No active assessment attempt found.",
        data: null,
        meta: null,
      });
    }

    if (result.expired) {
      return res.status(200).json({
        success: true,
        message: "Assessment attempt has expired.",
        data: {
          attemptId: result.attemptId,
          status: "EXPIRED",
        },
        meta: null,
      });
    }

    const response = toCandidateCurrentAttemptResponse(result.attempt);

    return res.status(200).json({
      success: true,
      message: "Current assessment attempt retrieved successfully.",
      data: response,
      meta: null,
    });
  });

  /**
   * Save Answer Handler
   * POST /api/v1/attempts/save-answer
   * Passwordless Candidate Real-Time Autosave Engine Point
   */
  saveAnswer = asyncHandler(async (req, res) => {
    const { token, attemptQuestionId, questionId, selectedOptionIds, answerText, version } = req.body || {};
    const candidateSession = req.candidateSession;

    const result = await attemptService.saveCandidateAnswer({
      token,
      candidateSession,
      attemptQuestionId,
      questionId,
      selectedOptionIds,
      answerText,
      version,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Answer saved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Submit Candidate Assessment Attempt Handler
   * POST /api/v1/attempts/submit
   */
  submitAttempt = asyncHandler(async (req, res) => {
    const { token } = req.body || {};
    const candidateSession = req.candidateSession;

    const executeSubmission = async () => {
      const result = await attemptService.submitCandidateAttempt({
        token,
        candidateSession,
      });

      const responseData = {
        attemptId: result.attemptId,
        status: result.status,
        submittedAt: result.submittedAt,
        score: result.score,
        maximumScore: result.maximumScore,
        percentage: result.percentage,
        passed: result.passed,
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        unansweredCount: result.unansweredCount,
      };

      return {
        statusCode: 200,
        response: {
          success: true,
          message: result.alreadySubmitted
            ? "Assessment attempt was already submitted."
            : "Assessment attempt submitted successfully.",
          data: responseData,
          meta: null,
        },
      };
    };

    if (req.idempotency?.key) {
      const idempotentResult = await idempotencyService.executeIdempotent({
        idempotencyKey: req.idempotency.key,
        execute: executeSubmission,
      });
      return res.status(idempotentResult.statusCode || 200).json(idempotentResult.response);
    }

    const directResult = await executeSubmission();
    return res.status(directResult.statusCode).json(directResult.response);
  });

  /**
   * Get Assessment Results List Handler (HR / Admin)
   * GET /api/v1/assessments/:assessmentId/results
   */
  getAssessmentResults = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;

    const result = await attemptService.getAssessmentResults({
      assessmentId,
      query: req.query,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Assessment results retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  });

  /**
   * Get Assessment Real-Time Analytics Handler (HR / Admin)
   * GET /api/v1/assessments/:assessmentId/analytics
   */
  getAssessmentAnalytics = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;

    const result = await attemptService.getAssessmentAnalytics({
      assessmentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Assessment analytics retrieved successfully.",
      data: result,
      meta: null,
    });
  });

  /**
   * Get Detailed Candidate Attempt Result Handler (HR / Admin)
   * GET /api/v1/assessments/:assessmentId/results/:attemptId
   */
  getAttemptResultDetail = asyncHandler(async (req, res) => {
    const { assessmentId, attemptId } = req.params;

    const result = await attemptService.getAttemptResultDetail({
      assessmentId,
      attemptId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Assessment attempt result retrieved successfully.",
      data: result,
      meta: null,
    });
  });

  /**
   * Send Candidate Email OTP Handler
   * POST /api/v1/attempts/candidate/send-otp
   */
  sendCandidateOtp = asyncHandler(async (req, res) => {
    const { email, invitationToken } = req.body;

    const result = await attemptService.sendCandidateOtp({
      email,
      invitationToken,
      emailService: req.app?.locals?.emailService,
      invitationRepository: req.app?.locals?.invitationRepository,
    });

    return res.status(200).json({
      success: true,
      message: "If the verification request is valid, an OTP has been sent to the candidate email.",
      data: {
        cooldownSeconds: result.cooldownSeconds,
        expiresAt: result.expiresAt,
      },
      meta: null,
    });
  });

  /**
   * Verify Candidate Email OTP Handler
   * POST /api/v1/attempts/candidate/verify-otp
   */
  verifyCandidateOtp = asyncHandler(async (req, res) => {
    const { email, otp, invitationToken } = req.body;

    const result = await attemptService.verifyCandidateOtp({
      email,
      otp,
      invitationToken,
      invitationRepository: req.app?.locals?.invitationRepository,
    });

    return res.status(200).json({
      success: true,
      message: "Candidate email verified successfully.",
      data: {
        verified: result.verified,
        candidateAccessToken: result.candidateAccessToken,
        candidateAssessmentId: result.candidateAssessmentId,
        assessmentId: result.assessmentId,
        expiresAt: result.expiresAt,
        verifiedAt: result.verifiedAt,
      },
      meta: null,
    });
  });

  /**
   * Verify Candidate Invitation Token (Public)
   * GET /api/v1/attempts/verify/:token
   * GET /api/v1/invitations/verify/:token
   */
  verifyInvitation = asyncHandler(async (req, res) => {
    const rawToken = req.params.token || req.body?.token || req.query?.token;
    const invitation = await attemptService.findInvitationByRawToken(rawToken);

    return res.status(200).json({
      success: true,
      message: "Invitation verified successfully.",
      data: {
        id: invitation.id,
        token: rawToken,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        isExpired: invitation.expiresAt <= new Date(),
        assessmentId: invitation.assessmentId,
        candidateId: invitation.candidateId,
        assessment: invitation.assessment,
        candidate: invitation.candidate,
      },
      meta: null,
    });
  });

  /**
   * Evaluate Candidate Subjective Answer Handler (HR / Super Admin)
   * POST /api/v1/attempts/:attemptId/evaluate-answer
   */
  evaluateAnswer = asyncHandler(async (req, res) => {
    const { attemptId } = req.params;
    const { attemptAnswerId, evaluationStatus, marksAwarded } = req.body;
    const evaluator = req.user;

    const result = await attemptService.evaluateCandidateAnswer({
      attemptId,
      attemptAnswerId,
      evaluationStatus,
      marksAwarded,
      evaluator,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Assessment answer evaluated successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Get HR Assessment Results List Handler
   * GET /api/v1/attempts
   */
  getHRAttemptResults = asyncHandler(async (req, res) => {
    const result = await attemptService.getHRAttemptResults({
      query: req.query,
      user: req.user,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Assessment results retrieved successfully.",
        data: result.items.map(toHRAttemptListResponse),
        meta: result.pagination,
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Assessment Dashboard Real-Time Analytics Handler
   * GET /api/v1/attempts/assessments/:assessmentId/analytics
   */
  getAssessmentAnalytics = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;
    const result = await attemptService.getAssessmentDashboard({
      assessmentId,
      query: req.query,
      user: req.user,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Assessment analytics retrieved successfully.",
        data: toAssessmentAnalyticsResponse(result),
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Detailed Attempt for HR Review Handler
   * GET /api/v1/attempts/:attemptId
   */
  getHRAttemptDetail = asyncHandler(async (req, res) => {
    const { attemptId } = req.params;
    const attempt = await attemptService.getHRAttemptDetail({
      attemptId,
      user: req.user,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Assessment attempt detail retrieved successfully.",
        data: toHRAttemptDetailResponse(attempt),
      },
      StatusCodes.OK
    );
  });
}

const attemptController = new AttemptController();
module.exports = attemptController;
module.exports.sendCandidateOtpController = attemptController.sendCandidateOtp.bind(attemptController);
module.exports.verifyCandidateOtpController = attemptController.verifyCandidateOtp.bind(attemptController);
module.exports.evaluateAnswerController = attemptController.evaluateAnswer.bind(attemptController);
module.exports.getHRAttemptResultsController = attemptController.getHRAttemptResults.bind(attemptController);
module.exports.getAssessmentAnalyticsController = attemptController.getAssessmentAnalytics.bind(attemptController);
module.exports.getHRAttemptDetailController = attemptController.getHRAttemptDetail.bind(attemptController);

