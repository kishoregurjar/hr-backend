const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { CATEGORY_MESSAGES } = require("./category.constants");
const categoryService = require("./category.service");

/**
 * ==========================================================
 * Enterprise Category Controller
 * ==========================================================
 * Express HTTP handlers for Category module endpoints.
 * Uses req.validatedData and delegates 100% to Category service.
 * ==========================================================
 */
class CategoryController {
  create = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const userId = req.user.id;

    const result = await categoryService.createCategory(payload, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.CREATED,
        data: result.data,
      },
      StatusCodes.CREATED
    );
  });

  list = asyncHandler(async (req, res) => {
    const query = req.validatedData || req.query;

    const result = await categoryService.getCategories(query);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.LIST_FETCHED,
        data: result.data,
        meta: result.meta,
      },
      StatusCodes.OK
    );
  });

  getById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await categoryService.getCategoryById(id);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.FETCHED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = req.validatedData || req.body;
    const userId = req.user.id;

    const result = await categoryService.updateCategory(id, payload, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.UPDATED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await categoryService.deleteCategory(id, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.DELETED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });

  restore = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await categoryService.restoreCategory(id, userId);

    return SuccessResponse.send(
      res,
      {
        message: result.message || CATEGORY_MESSAGES.RESTORED,
        data: result.data,
      },
      StatusCodes.OK
    );
  });
}

const categoryController = new CategoryController();

module.exports = categoryController;
