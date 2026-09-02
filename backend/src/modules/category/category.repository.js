const { prisma } = require("../../config/prisma");

const CATEGORY_DEFAULT_SELECT = Object.freeze({
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
});

const CATEGORY_WITH_COUNT_SELECT = Object.freeze({
  ...CATEGORY_DEFAULT_SELECT,
  _count: {
    select: {
      questions: true,
    },
  },
});

const getClient = (tx) =>
  tx && typeof tx === "object" && tx.category ? tx : prisma;

/**
 * ==========================================================
 * Enterprise Category Repository
 * ==========================================================
 * Pure Data Access Layer for Category model.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class CategoryRepository {
  async findById(id, tx) {
    const db = getClient(tx);
    return db.category.findUnique({
      where: { id },
      select: CATEGORY_DEFAULT_SELECT,
    });
  }

  async findByName(name, tx) {
    const db = getClient(tx);
    return db.category.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: "insensitive",
        },
      },
    });
  }

  async create(tx, data) {
    const db = getClient(tx);
    const { isActive: _isActive, ...cleanData } = data || {};
    return db.category.create({
      data: cleanData,
      select: CATEGORY_DEFAULT_SELECT,
    });
  }

  async update(tx, id, data) {
    const db = getClient(tx);
    const { isActive: _isActive, ...cleanData } = data || {};
    return db.category.update({
      where: { id },
      data: cleanData,
      select: CATEGORY_DEFAULT_SELECT,
    });
  }

  async softDelete(tx, id) {
    const db = getClient(tx);
    return db.category.delete({
      where: { id },
      select: CATEGORY_DEFAULT_SELECT,
    });
  }

  async restore(tx, id) {
    const db = getClient(tx);
    return db.category.findUnique({
      where: { id },
      select: CATEGORY_DEFAULT_SELECT,
    });
  }

  async listActive(tx) {
    const db = getClient(tx);
    return db.category.findMany({
      orderBy: { name: "asc" },
      select: CATEGORY_WITH_COUNT_SELECT,
    });
  }

  async findAllPaginated({ page = 1, limit = 10, search }, tx) {
    const db = getClient(tx);
    const skip = (page - 1) * limit;

    const where = {};
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [categories, total] = await Promise.all([
      db.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: CATEGORY_WITH_COUNT_SELECT,
      }),
      db.category.count({ where }),
    ]);

    return { categories, total };
  }

  async countAssociatedQuestions(id, tx) {
    const db = getClient(tx);
    return db.questionCategory.count({
      where: {
        categoryId: id,
      },
    });
  }
}

module.exports = new CategoryRepository();
