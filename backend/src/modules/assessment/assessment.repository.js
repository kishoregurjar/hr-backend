const { prisma } = require("../../config/prisma");

/**
 * ==========================================================
 * Assessment Prisma Select Projections
 * ==========================================================
 */
const ASSESSMENT_LIST_SELECT = Object.freeze({
  id: true,
  title: true,
  description: true,
  durationMinutes: true,
  passingScore: true,
  maximumScore: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

const ASSESSMENT_DETAIL_SELECT = Object.freeze({
  id: true,
  title: true,
  description: true,
  durationMinutes: true,
  passingScore: true,
  maximumScore: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  questions: {
    orderBy: {
      orderIndex: "asc",
    },
    select: {
      assessmentId: true,
      questionId: true,
      orderIndex: true,
      points: true,
      negativePoints: true,
      question: {
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          difficulty: true,
          status: true,
          explanation: true,
          codeSnippet: true,
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
        },
      },
    },
  },
});

/**
 * Helper to resolve database client (standalone Prisma OR active transaction client tx)
 */
const getClient = (tx) =>
  tx && typeof tx === "object" && tx.assessment ? tx : prisma;

/**
 * ==========================================================
 * Assessment Repository
 * ==========================================================
 * Pure Data Access Layer for Assessment model.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class AssessmentRepository {
  /**
   * Find Assessment By ID
   */
  async findById(id, options = {}, tx) {
    const db = getClient(tx);
    const { detailed = true } = options;

    return db.assessment.findUnique({
      where: { id },
      select: detailed ? ASSESSMENT_DETAIL_SELECT : ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Find Assessment By ID Using Transaction Client
   */
  async findByIdTx(tx, id, options = {}) {
    return this.findById(id, options, tx);
  }

  /**
   * Find Assessment By Title (Case-insensitive exact match)
   */
  async findByTitle(title, options = {}, tx) {
    const db = getClient(tx);
    const { excludeId = undefined } = options;

    const where = {
      title: {
        equals: title.trim(),
        mode: "insensitive",
      },
    };

    if (excludeId) {
      where.id = {
        not: excludeId,
      };
    }

    return db.assessment.findFirst({
      where,
      select: ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Create Assessment
   */
  async create(tx, data) {
    const db = getClient(tx);
    const {
      instructions: _inst,
      maxAttempts: _mA,
      difficulty: _diff,
      publishAt: _pA,
      ...cleanData
    } = data || {};

    return db.assessment.create({
      data: cleanData,
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Update Assessment
   */
  async update(tx, id, data) {
    const db = getClient(tx);
    const {
      instructions: _inst,
      maxAttempts: _mA,
      difficulty: _diff,
      publishAt: _pA,
      ...cleanData
    } = data || {};

    return db.assessment.update({
      where: { id },
      data: cleanData,
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Soft Delete Assessment
   */
  async softDelete(tx, id) {
    const db = getClient(tx);
    return db.assessment.delete({
      where: { id },
      select: ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Restore Assessment
   */
  async restore(tx, id) {
    const db = getClient(tx);
    return db.assessment.findUnique({
      where: { id },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Publish Assessment
   */
  async publish(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: { id },
      data: {
        status: "PUBLISHED",
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Unpublish Assessment
   */
  async unpublish(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: { id },
      data: {
        status: "DRAFT",
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Activate Assessment
   */
  async activate(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: { id },
      data: {
        status: "ACTIVE",
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Archive Assessment
   */
  async archive(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: { id },
      data: {
        status: "ARCHIVED",
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * List Paginated Assessments
   */
  async listPaginated(options = {}, tx) {
    const db = getClient(tx);

    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const where = {};

    if (options.status && options.status !== "all") {
      where.status = options.status;
    }

    if (options.type && options.type !== "all") {
      where.type = options.type;
    }

    if (options.createdById) {
      where.createdById = options.createdById;
    }

    if (options.search && options.search.trim()) {
      const search = options.search.trim();
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const sortBy = options.sortBy || "createdAt";
    const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

    const [items, total] = await Promise.all([
      db.assessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: ASSESSMENT_LIST_SELECT,
      }),
      db.assessment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Assign Question to Assessment
   */
  async assignQuestion(tx, assessmentId, questionId, orderIndex = 0, points = 1, negativePoints = 0.0) {
    const db = getClient(tx);
    return db.assessmentQuestion.upsert({
      where: {
        assessmentId_questionId: {
          assessmentId,
          questionId,
        },
      },
      create: {
        assessmentId,
        questionId,
        orderIndex,
        points,
        negativePoints,
      },
      update: {
        orderIndex,
        points,
        negativePoints,
      },
    });
  }

  /**
   * Remove Question from Assessment
   */
  async removeQuestion(tx, assessmentId, questionId) {
    const db = getClient(tx);
    return db.assessmentQuestion.delete({
      where: {
        assessmentId_questionId: {
          assessmentId,
          questionId,
        },
      },
    });
  }

  /**
   * Clear All Questions from Assessment
   */
  async clearQuestions(tx, assessmentId) {
    const db = getClient(tx);
    return db.assessmentQuestion.deleteMany({
      where: {
        assessmentId,
      },
    });
  }
}

module.exports = new AssessmentRepository();
