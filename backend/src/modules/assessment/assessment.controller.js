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
    const companyId = req.companyId || req.company?.id || req.headers["x-company-id"] || null;

    const result = await assessmentService.createAssessment(data, userId, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.getAssessments(query, user, companyId);

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
    const companyId = req.companyId || req.company?.id || req.headers["x-company-id"] || null;

    const result = await assessmentService.getAssessmentById(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || req.headers["x-company-id"] || null;

    const result = await assessmentService.updateAssessment(id, data, user, companyId);

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
    const companyId = req.companyId || req.company?.id || req.headers["x-company-id"] || null;

    const result = await assessmentService.deleteAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.restoreAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.assignQuestions(id, data, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.reorderQuestions(id, data, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.publishAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.unpublishAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.activateAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.archiveAssessment(id, user, companyId);

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
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.duplicateAssessment(id, data, user, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || ASSESSMENT_MESSAGES.DUPLICATED,
        data: result.data,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Finalize Candidate Assessment & Weighted Scoring Handler
   * POST /api/v1/assessments/candidate-assessments/:candidateAssessmentId/finalize
   */
  finalizeAssessment = asyncHandler(async (req, res) => {
    const { candidateAssessmentId } = req.params;
    const candidateId = req.user?.id || req.user?.userId;

    const scoringService = require("./assessment.scoring.service");
    const scoringDto = require("./assessment.scoring.dto");

    const result = await scoringService.finalizeAssessment({
      candidateId,
      candidateAssessmentId,
    });

    return SuccessResponse.send(
      res,
      {
        message: result.alreadyFinalized
          ? "Assessment already finalized"
          : "Assessment finalized and scored successfully",
        data: scoringDto.buildAssessmentResultResponse(result),
      },
      result.alreadyFinalized ? StatusCodes.OK : StatusCodes.CREATED
    );
  });

  /**
   * Bulk Delete Selected Assessments Handler (Soft Delete, Company Scoped)
   * DELETE /api/v1/assessments/bulk
   */
  bulkDelete = asyncHandler(async (req, res) => {
    const { ids } = req.body || {};
    const user = req.user;
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.bulkDeleteAssessments(ids, user, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Assessments deleted successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Delete All Draft Assessments Handler (Soft Delete, Company Scoped)
   * DELETE /api/v1/assessments/all
   */
  deleteAll = asyncHandler(async (req, res) => {
    const user = req.user;
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.deleteAllAssessments(user, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "All draft assessments deleted successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Quarantine Assessment Handler
   * POST /api/v1/assessments/:id/quarantine
   */
  quarantine = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason, evidence } = req.body || {};
    const user = req.user;
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.quarantineAssessment(id, { reason, evidence }, user, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message,
        data: result.data,
        quarantineLogId: result.quarantineLogId,
      },
      StatusCodes.OK
    );
  });

  /**
   * Resolve Quarantine Handler
   * POST /api/v1/assessments/:id/quarantine/resolve
   */
  resolveQuarantine = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, targetCompanyId, notes } = req.body || {};
    const user = req.user;
    const companyId = req.companyId || req.company?.id || null;

    const result = await assessmentService.resolveQuarantine(id, { action, targetCompanyId, notes }, user, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message,
        data: result.data,
        resolution: result.resolution,
      },
      StatusCodes.OK
    );
  });
}

const assessmentController = new AssessmentController();

module.exports = assessmentController;
