const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { ASSESSMENT_MESSAGES } = require("./assessment.constants");
const assessmentService = require("./assessment.service");

/**
 * ==========================================================
 * Enterprise Assessment Controller
 * ==========================================================
 * Express HTTP handlers for Assessment Builder endpoints.
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */
class AssessmentController {
  /**
   * Create Assessment Handler
   * POST /api/v1/assessments
   */
  create = asyncHandler(async (req, res) => {
    const data = req.validatedData || req.validatedBody || req.body;
    const userId = req.user?.id;

    const result = await assessmentService.createAssessment(data, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.CREATED,
        data: result.data,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * List Assessments Handler (Paginated, Searchable, Sorted, Filtered)
   * GET /api/v1/assessments
   */
  list = asyncHandler(async (req, res) => {
    const query = req.validatedData || req.validatedQuery || req.query;
    const user = req.user;

    const result = await assessmentService.getAssessments(query, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.LIST_FETCHED,
        data: result.data,
        meta: result.meta,
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Assessment By ID Handler
   * GET /api/v1/assessments/:id
   */
  getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.getAssessmentById(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.FETCHED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Update Assessment Handler
   * PATCH /api/v1/assessments/:id
   */
  update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.validatedData || req.validatedBody || req.body;
    const user = req.user;

    const result = await assessmentService.updateAssessment(id, data, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.UPDATED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Soft Delete Assessment Handler
   * DELETE /api/v1/assessments/:id
   */
  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.deleteAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.DELETED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Restore Assessment Handler
   * PATCH /api/v1/assessments/:id/restore
   */
  restore = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.restoreAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.RESTORED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Assign Questions to Assessment Handler
   * POST /api/v1/assessments/:id/questions
   */
  assignQuestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.validatedData || req.validatedBody || req.body;
    const user = req.user;

    const result = await assessmentService.assignQuestions(id, data, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Questions assigned to assessment successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Reorder Assessment Questions Handler
   * PATCH /api/v1/assessments/:id/questions/reorder
   */
  reorderQuestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.validatedData || req.validatedBody || req.body;
    const user = req.user;

    const result = await assessmentService.reorderQuestions(id, data, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Assessment questions reordered successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Publish Assessment Handler
   * POST /api/v1/assessments/:id/publish
   */
  publish = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.publishAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.PUBLISHED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Unpublish Assessment Handler
   * POST /api/v1/assessments/:id/unpublish
   */
  unpublish = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.unpublishAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.UNPUBLISHED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Activate Assessment Handler
   * POST /api/v1/assessments/:id/activate
   */
  activate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.activateAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.ACTIVATED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Archive Assessment Handler
   * POST /api/v1/assessments/:id/archive
   */
  archive = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    const result = await assessmentService.archiveAssessment(id, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.ARCHIVED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Duplicate Assessment Handler
   * POST /api/v1/assessments/:id/duplicate
   */
  duplicate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.validatedData || req.validatedBody || req.body || {};
    const user = req.user;

    const result = await assessmentService.duplicateAssessment(id, data, user);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.DUPLICATED,
        data: result.data,
      },
      StatusCodes.CREATED
    );
  });
}

const assessmentController = new AssessmentController();

module.exports = assessmentController;
