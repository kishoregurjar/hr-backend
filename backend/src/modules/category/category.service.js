const { ConflictError, NotFoundError, BadRequestError } = require("../../common/errors");
const { runTransaction } = require("../../common/transaction");
const logger = require("../../config/logger");
const categoryRepository = require("./category.repository");
const { CategoryMapper } = require("./category.mapper");
const { CategoryDto } = require("./category.dto");
const { CATEGORY_MESSAGES } = require("./category.constants");

/**
 * ==========================================================
 * Category Service
 * ==========================================================
 * Single Domain Service class handling all Category business operations.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class CategoryService {
  async createCategory(payload, userId) {
    const name = payload.name.trim();
    logger.info({ userId, name }, "Initiating category creation");

    const existingCategory = await categoryRepository.findByName(name);
    if (existingCategory) {
      throw new ConflictError("Category already exists.", "CATEGORY_ALREADY_EXISTS");
    }

    const createdCategory = await runTransaction(async (tx) => {
      const categoryData = CategoryMapper.toCreateEntity(payload, userId);
      return categoryRepository.create(tx, categoryData);
    });

    return {
      message: CATEGORY_MESSAGES.CREATED,
      data: CategoryDto.toResponse(createdCategory),
    };
  }

  async getCategories(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const search = query.search?.trim();

    const { categories, total } = await categoryRepository.findAllPaginated({
      page,
      limit,
      search,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      message: CATEGORY_MESSAGES.LIST_FETCHED,
      data: CategoryDto.toCollection(categories),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getCategoryById(id) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError("Category not found.", "CATEGORY_NOT_FOUND");
    }

    return {
      message: CATEGORY_MESSAGES.FETCHED,
      data: CategoryDto.toResponse(category),
    };
  }

  async updateCategory(id, payload, userId) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError("Category not found.", "CATEGORY_NOT_FOUND");
    }

    if (payload.name) {
      const name = payload.name.trim();
      const existing = await categoryRepository.findByName(name);
      if (existing && existing.id !== id) {
        throw new ConflictError("Category name already exists.", "CATEGORY_ALREADY_EXISTS");
      }
    }

    const updateData = CategoryMapper.toUpdateEntity(payload, userId);
    const updatedCategory = await runTransaction(async (tx) => {
      return categoryRepository.update(tx, id, updateData);
    });

    return {
      message: CATEGORY_MESSAGES.UPDATED,
      data: CategoryDto.toResponse(updatedCategory),
    };
  }

  async deleteCategory(id, userId) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError("Category not found.", "CATEGORY_NOT_FOUND");
    }

    const deletedCategory = await runTransaction(async (tx) => {
      return categoryRepository.softDelete(tx, id);
    });

    return {
      message: CATEGORY_MESSAGES.DELETED,
      data: { id: deletedCategory.id, deletedAt: deletedCategory.deletedAt },
    };
  }

  async restoreCategory(id, userId) {
    const category = await categoryRepository.findById(id, { includeDeleted: true });
    if (!category) {
      throw new NotFoundError("Category not found.", "CATEGORY_NOT_FOUND");
    }

    if (!category.deletedAt) {
      throw new ConflictError("Category is already active.", "CATEGORY_ALREADY_ACTIVE");
    }

    const restoredCategory = await runTransaction(async (tx) => {
      return categoryRepository.restore(tx, id);
    });

    return {
      message: CATEGORY_MESSAGES.RESTORED,
      data: CategoryDto.toResponse(restoredCategory),
    };
  }
}

module.exports = new CategoryService();
