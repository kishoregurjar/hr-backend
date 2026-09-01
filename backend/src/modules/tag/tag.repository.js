const { prisma } = require("../../config/prisma");

const TAG_DEFAULT_SELECT = Object.freeze({
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

const TAG_WITH_COUNT_SELECT = Object.freeze({
  ...TAG_DEFAULT_SELECT,
  _count: {
    select: {
      questionTags: true,
    },
  },
});

const getClient = (tx) =>
  tx && typeof tx === "object" && tx.tag ? tx : prisma;

/**
 * ==========================================================
 * Enterprise Tag Repository
 * ==========================================================
 * Pure Data Access Layer for Tag model.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class TagRepository {
  async findById(id, tx) {
    const db = getClient(tx);
    return db.tag.findUnique({
      where: { id },
      select: TAG_DEFAULT_SELECT,
    });
  }

  async findByName(name, tx) {
    const db = getClient(tx);
    return db.tag.findFirst({
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
    return db.tag.create({
      data,
      select: TAG_DEFAULT_SELECT,
    });
  }

  async update(tx, id, data) {
    const db = getClient(tx);
    return db.tag.update({
      where: { id },
      data,
      select: TAG_DEFAULT_SELECT,
    });
  }

  async softDelete(tx, id) {
    const db = getClient(tx);
    return db.tag.update({
      where: { id },
      data: { isActive: false },
      select: TAG_DEFAULT_SELECT,
    });
  }

  async restore(tx, id) {
    const db = getClient(tx);
    return db.tag.update({
      where: { id },
      data: { isActive: true },
      select: TAG_DEFAULT_SELECT,
    });
  }

  async listActive(tx) {
    const db = getClient(tx);
    return db.tag.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: TAG_WITH_COUNT_SELECT,
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

    const [tags, total] = await Promise.all([
      db.tag.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: TAG_WITH_COUNT_SELECT,
      }),
      db.tag.count({ where }),
    ]);

    return { tags, total };
  }

  async countAssociatedQuestions(id, tx) {
    const db = getClient(tx);
    return db.questionTag.count({
      where: {
        tagId: id,
        question: {
          deletedAt: null,
        },
      },
    });
  }
}

module.exports = new TagRepository();
