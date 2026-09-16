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
  games: {
    orderBy: {
      sequence: "asc",
    },
    select: {
      assessmentId: true,
      gameId: true,
      sequence: true,
      weight: true,
      game: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true,
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
   * Atomic State Transition for Assessment
   */
  async transitionStatus(tx, { id, fromStatus, toStatus, data = {} }) {
    const db = getClient(tx);
    try {
      const existing = await db.assessment.findFirst({
        where: { id },
      });

      if (!existing) {
        return null;
      }

      if (existing.status === toStatus) {
        return this.findById(id, { detailed: true }, tx);
      }

      if (fromStatus && existing.status !== fromStatus) {
        return null;
      }

      return await db.assessment.update({
        where: { id },
        data: {
          ...data,
          status: toStatus,
        },
        select: ASSESSMENT_DETAIL_SELECT,
      });
    } catch (_err) {
      console.error("assessmentRepository.transitionStatus error:", _err);
      return null;
    }
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
   * Add / Assign Multiple Questions to Assessment
   */
  async addQuestions(tx, assessmentId, questionsData = []) {
    const db = getClient(tx);
    const operations = questionsData.map((item) =>
      db.assessmentQuestion.upsert({
        where: {
          assessmentId_questionId: {
            assessmentId,
            questionId: item.questionId,
          },
        },
        create: {
          assessmentId,
          questionId: item.questionId,
          orderIndex: item.sequence !== undefined ? item.sequence : (item.orderIndex || 0),
          points: item.marks !== undefined ? item.marks : (item.points || 1),
          negativePoints: item.negativeMarks !== undefined ? item.negativeMarks : (item.negativePoints || 0.0),
        },
        update: {
          orderIndex: item.sequence !== undefined ? item.sequence : (item.orderIndex || 0),
          points: item.marks !== undefined ? item.marks : (item.points || 1),
          negativePoints: item.negativeMarks !== undefined ? item.negativeMarks : (item.negativePoints || 0.0),
        },
      })
    );
    return Promise.all(operations);
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

  /**
   * Synchronize Games Attached to Assessment
   */
  async syncGames(tx, assessmentId, gameIds = []) {
    const db = getClient(tx);
    await db.assessmentGame.deleteMany({
      where: {
        assessmentId,
      },
    });

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      return [];
    }

    const cleanGameIds = gameIds.filter(Boolean);
    const records = [];

    for (let idx = 0; idx < cleanGameIds.length; idx++) {
      const rawId = String(cleanGameIds[idx]).trim();
      let targetGameId = null;

      const existingGame = await db.game.findFirst({
        where: {
          OR: [
            { id: rawId },
            { code: rawId },
            { code: rawId.toLowerCase() },
            { code: rawId.toUpperCase() },
          ],
          deletedAt: null,
        },
      });

      if (existingGame) {
        targetGameId = existingGame.id;
      } else {
        const code = rawId.toLowerCase();
        const formattedName = code
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        const createdGame = await db.game.upsert({
          where: { code },
          create: {
            code,
            name: formattedName,
            description: `${formattedName} Cognitive Game`,
            isActive: true,
          },
          update: {
            isActive: true,
          },
        });
        targetGameId = createdGame.id;
      }

      if (targetGameId) {
        records.push({
          assessmentId,
          gameId: targetGameId,
          sequence: idx + 1,
          weight: 1.0,
        });
      }
    }

    if (records.length > 0) {
      await db.assessmentGame.createMany({
        data: records,
      });
    }

    return db.assessmentGame.findMany({
      where: { assessmentId },
    });
  }

  /**
   * Clear All Games from Assessment
   */
  async clearGames(tx, assessmentId) {
    const db = getClient(tx);
    return db.assessmentGame.deleteMany({
      where: {
        assessmentId,
      },
    });
  }
}

module.exports = new AssessmentRepository();
