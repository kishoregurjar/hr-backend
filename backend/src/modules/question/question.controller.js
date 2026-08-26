const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const questionService = require("./question.service");

/**
 * ==========================================================
 * Enterprise Question Controller
 * ==========================================================
 * Express HTTP handlers for Question Bank endpoints.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class QuestionController {
  create = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const userId = req.user.id;

    const result = await questionService.createQuestion(payload, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question created successfully.",
        data: result.data,
      },
      StatusCodes.CREATED
    );
  });

  list = asyncHandler(async (req, res) => {
    const query = req.validatedData || req.query;

    const result = await questionService.getQuestions(query);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Questions retrieved successfully.",
        data: result.data,
        meta: result.meta,
      },
      StatusCodes.OK
    );
  });

  getById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await questionService.getQuestionById(id);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question fetched successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.validatedData || req.body;
    const userId = req.user.id;

    const result = await questionService.updateQuestion(id, payload, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question updated successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await questionService.deleteQuestion(id, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question deleted successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  publish = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await questionService.publishQuestion(id, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question published successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  archive = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await questionService.archiveQuestion(id, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Question archived successfully.",
        data: result.data,
      },
      StatusCodes.OK
    );
  });
}

const questionController = new QuestionController();

module.exports = questionController;
