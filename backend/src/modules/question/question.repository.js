const { prisma } = require("../../config/prisma");

const QUESTION_DEFAULT_SELECT = Object.freeze({
  id: true,
  title: true,
  content: true,
  explanation: true,
  codeSnippet: true,
  sampleTestCase: true,
  type: true,
  difficulty: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
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
      explanation: true,
    },
    orderBy: {
      sequence: "asc",
    },
  },
});

const QUESTION_LIST_SELECT = Object.freeze({
  id: true,
  title: true,
  content: true,
  type: true,
  difficulty: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
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
});

const getClient = (tx) =>
  tx && typeof tx === "object" && tx.question ? tx : prisma;

/**
 * ==========================================================
 * Enterprise Question Repository
 * ==========================================================
 * Pure Data Access Layer for Question, Option, & QuestionTag models.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class QuestionRepository {
  async findById(id, tx) {
    const db = getClient(tx);
    return db.question.findUnique({
      where: { id },
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
      },
    });
  }

  async validateCategoryExists(categoryId, tx) {
    const db = getClient(tx);
    const category = await db.category.findUnique({
      where: { id: categoryId },
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
      },
    });
    return count === tagIds.length;
  }

  async create(tx, questionData, optionsData = [], tagIds = [], categoryIds = []) {
    const db = getClient(tx);

    const {
      description,
      marks: _marks,
      negativeMarks: _negMarks,
      estimatedTime: _estTime,
      shuffleOptions: _shuffle,
      categoryId,
      createdById: _cById,
      updatedById: _uById,
      ...restData
    } = questionData || {};

    const content = restData.content || description || restData.title || "";
    const cleanCategoryIds = Array.isArray(categoryIds) && categoryIds.length > 0
      ? categoryIds
      : (categoryId ? [categoryId] : []);

    return db.question.create({
      data: {
        ...restData,
        content,
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
        ...(cleanCategoryIds.length > 0 && {
          categories: {
            create: cleanCategoryIds.map((catId) => ({
              category: { connect: { id: catId } },
            })),
          },
        }),
      },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async update(tx, id, questionData, optionsData = null, tagIds = null, categoryIds = null) {
    const db = getClient(tx);

    if (optionsData !== null) {
      await db.option.deleteMany({
        where: { questionId: id },
      });
    }

    if (tagIds !== null) {
      await db.questionTag.deleteMany({
        where: { questionId: id },
      });
    }

    if (categoryIds !== null) {
      await db.questionCategory.deleteMany({
        where: { questionId: id },
      });
    }

    const {
      description,
      marks: _marks,
      negativeMarks: _negMarks,
      estimatedTime: _estTime,
      shuffleOptions: _shuffle,
      categoryId,
      createdById: _cById,
      updatedById: _uById,
      ...restData
    } = questionData || {};

    if (description !== undefined && !restData.content) {
      restData.content = description || "";
    }

    const cleanCategoryIds = categoryIds !== null
      ? categoryIds
      : (categoryId !== undefined ? (categoryId ? [categoryId] : []) : null);

    return db.question.update({
      where: { id },
      data: {
        ...restData,
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
        ...(cleanCategoryIds !== null && {
          categories: {
            create: cleanCategoryIds.map((catId) => ({
              category: { connect: { id: catId } },
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
    return db.question.delete({
      where: { id },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async restore(tx, id) {
    const db = getClient(tx);
    return db.question.findUnique({
      where: { id },
      select: QUESTION_DEFAULT_SELECT,
    });
  }

  async listPaginated({ page = 1, limit = 10, search, type, difficulty, status, categoryId, tagId, sortBy = "createdAt", sortOrder = "desc" }, tx) {
    const db = getClient(tx);
    const skip = (page - 1) * limit;

    const where = {};

    if (type && type !== "all") where.type = type;
    if (difficulty && difficulty !== "all") where.difficulty = difficulty;
    if (status && status !== "all") where.status = status;

    if (categoryId && categoryId !== "all") {
      where.categories = {
        some: {
          categoryId,
        },
      };
    }

    if (tagId && tagId !== "all") {
      where.tags = {
        some: {
          tagId,
        },
      };
    }

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { content: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const validSortFields = ["createdAt", "updatedAt", "title", "difficulty", "status"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [data, total] = await Promise.all([
      db.question.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortField]: sortOrder === "asc" ? "asc" : "desc",
        },
        select: QUESTION_LIST_SELECT,
      }),
      db.question.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}

module.exports = new QuestionRepository();
