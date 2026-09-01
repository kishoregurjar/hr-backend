const { prisma } = require("../../config/prisma");

const QUESTION_DEFAULT_SELECT = Object.freeze({
  id: true,
  title: true,
  description: true,
  explanation: true,
  type: true,
  difficulty: true,
  status: true,
  marks: true,
  negativeMarks: true,
  estimatedTime: true,
  shuffleOptions: true,
  version: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  options: {
    select: {
      id: true,
      optionText: true,
      isCorrect: true,
      sequence: true,
    },
    orderBy: {
      sequence: "asc",
    },
  },
});

const QUESTION_LIST_SELECT = Object.freeze({
  id: true,
  title: true,
  type: true,
  difficulty: true,
  status: true,
  marks: true,
  isActive: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
    },
  },
});

const getClient = (tx) =>
  tx && typeof tx === "object" && tx.question ? tx : prisma;

/**
 * ==========================================================
 * Enterprise Question Repository
 * ==========================================================
 * Pure Data Access Layer for Question, QuestionOption, & QuestionTag models.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class QuestionRepository {
  async findById(id, tx) {
    const db = getClient(tx);
    return db.question.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async findByTitle(title, tx) {
    const db = getClient(tx);
    return db.question.findFirst({
      where: {
        title: {
          equals: title.trim(),
          mode: "insensitive",
        },
        deletedAt: null,
      },
    });
  }

  async validateCategoryExists(categoryId, tx) {
    const db = getClient(tx);
    const category = await db.questionCategory.findFirst({
      where: {
        id: categoryId,
        isActive: true,
      },
      select: { id: true },
    });
    return Boolean(category);
  }

  async validateTagsExist(tagIds = [], tx) {
    if (!tagIds.length) return true;
    const db = getClient(tx);
    const count = await db.tag.count({
      where: {
        id: { in: tagIds },
        isActive: true,
      },
    });
    return count === tagIds.length;
  }

  async create(tx, questionData, optionsData = [], tagIds = []) {
    const db = getClient(tx);

    return db.question.create({
      data: {
        ...questionData,
        ...(optionsData.length > 0 && {
          options: {
            create: optionsData,
          },
        }),
        ...(tagIds.length > 0 && {
          tags: {
            create: tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
        }),
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async update(tx, id, questionData, optionsData = null, tagIds = null) {
    const db = getClient(tx);

    if (optionsData !== null) {
      await db.questionOption.deleteMany({
        where: { questionId: id },
      });
    }

    if (tagIds !== null) {
      await db.questionTag.deleteMany({
        where: { questionId: id },
      });
    }

    return db.question.update({
      where: { id },
      data: {
        ...questionData,
        ...(optionsData !== null && {
          options: {
            create: optionsData,
          },
        }),
        ...(tagIds !== null && {
          tags: {
            create: tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          },
        }),
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async publish(tx, id) {
    const db = getClient(tx);
    return db.question.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async archive(tx, id) {
    const db = getClient(tx);
    return db.question.update({
      where: { id },
      data: {
        status: "ARCHIVED",
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async softDelete(tx, id) {
    const db = getClient(tx);
    return db.question.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async restore(tx, id) {
    const db = getClient(tx);
    return db.question.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null,
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async listPaginated({ page = 1, limit = 10, search, type, difficulty, status, categoryId, tagId, sortBy = "createdAt", sortOrder = "desc", isActive = "true" }, tx) {
    const db = getClient(tx);
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
    };

    if (isActive !== "all") {
      where.isActive = isActive === "true";
    }

    if (type) where.type = type;
    if (difficulty) where.difficulty = difficulty;
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    if (tagId) {
      where.tags = {
        some: {
          tagId,
        },
      };
    }

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      db.question.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: QUESTION_LIST_SELECT,
      }),
      db.question.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}

module.exports = new QuestionRepository();
