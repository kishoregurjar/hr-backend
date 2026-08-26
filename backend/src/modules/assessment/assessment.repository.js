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
  maxAttempts: true,
  type: true,
  difficulty: true,
  status: true,
  publishAt: true,
  startsAt: true,
  endsAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const ASSESSMENT_DETAIL_SELECT = Object.freeze({
  id: true,
  title: true,
  description: true,
  instructions: true,
  durationMinutes: true,
  passingScore: true,
  maximumScore: true,
  maxAttempts: true,
  type: true,
  difficulty: true,
  status: true,
  publishAt: true,
  startsAt: true,
  endsAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  questions: {
    orderBy: {
      sequence: "asc",
    },
    select: {
      id: true,
      questionId: true,
      sequence: true,
      marks: true,
      negativeMarks: true,
      question: {
        select: {
          id: true,
          title: true,
          type: true,
          difficulty: true,
          status: true,
          isActive: true,
          deletedAt: true,
          marks: true,
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
    const { includeDeleted = false, detailed = true } = options;

    const where = {
      id,
    };

    if (!includeDeleted) {
      where.deletedAt = null;
    }

    return db.assessment.findFirst({
      where,
      select: detailed
        ? ASSESSMENT_DETAIL_SELECT
        : ASSESSMENT_LIST_SELECT,
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
    const { excludeId = undefined, includeDeleted = false } = options;

    const where = {
      title: {
        equals: title.trim(),
        mode: "insensitive",
      },
    };

    if (!includeDeleted) {
      where.deletedAt = null;
    }

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
    return db.assessment.create({
      data,
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Update Assessment
   */
  async update(tx, id, data) {
    const db = getClient(tx);
    return db.assessment.update({
      where: {
        id,
      },
      data,
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Soft Delete Assessment
   */
  async softDelete(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
      select: ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Restore Soft Deleted Assessment
   */
  async restore(tx, id) {
    const db = getClient(tx);
    return db.assessment.update({
      where: {
        id,
      },
      data: {
        deletedAt: null,
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Publish Assessment
   */
  async publish(tx, id, publishAt = new Date()) {
    const db = getClient(tx);
    return db.assessment.update({
      where: {
        id,
      },
      data: {
        status: "PUBLISHED",
        publishAt,
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
      where: {
        id,
      },
      data: {
        status: "DRAFT",
        publishAt: null,
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
      where: {
        id,
      },
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
      where: {
        id,
      },
      data: {
        status: "ARCHIVED",
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * Database-Safe Conditional Lifecycle Transition
   */
  async transitionStatus(tx, { id, fromStatus, toStatus, data = {} }) {
    const client = tx && typeof tx === "object" && tx.assessment ? tx : prisma;

    const result = await client.assessment.updateMany({
      where: {
        id,
        status: fromStatus,
        deletedAt: null,
      },
      data: {
        status: toStatus,
        ...data,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return client.assessment.findUnique({
      where: {
        id,
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }

  /**
   * List Assessments (Paginated, filtered, sorted)
   */
  async list({ where = {}, skip, take, orderBy }, tx) {
    const db = getClient(tx);
    return db.assessment.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      skip,
      take,
      orderBy,
      select: ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Count Assessments
   */
  async count(where = {}, tx) {
    const db = getClient(tx);
    return db.assessment.count({
      where: {
        ...where,
        deletedAt: null,
      },
    });
  }

  /**
   * List Assessments By Owner / Creator (For HR Scope)
   */
  async listByCreator({ createdById, where = {}, skip, take, orderBy }, tx) {
    const db = getClient(tx);
    return db.assessment.findMany({
      where: {
        ...where,
        createdById,
        deletedAt: null,
      },
      skip,
      take,
      orderBy,
      select: ASSESSMENT_LIST_SELECT,
    });
  }

  /**
   * Count Assessments By Owner / Creator
   */
  async countByCreator({ createdById, where = {} }, tx) {
    const db = getClient(tx);
    return db.assessment.count({
      where: {
        ...where,
        createdById,
        deletedAt: null,
      },
    });
  }

  /**
   * Add Bulk Questions to Assessment
   */
  async addQuestions(tx, assessmentId, questions) {
    const db = getClient(tx);
    return db.assessmentQuestion.createMany({
      data: questions.map((question) => ({
        assessmentId,
        questionId: question.questionId,
        sequence: question.sequence,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
      })),
      skipDuplicates: false,
    });
  }

  /**
   * Find Assigned Questions for an Assessment
   */
  async findAssignedQuestions(assessmentId, tx) {
    const db = getClient(tx);
    return db.assessmentQuestion.findMany({
      where: {
        assessmentId,
      },
      orderBy: {
        sequence: "asc",
      },
      select: {
        id: true,
        assessmentId: true,
        questionId: true,
        sequence: true,
        marks: true,
        negativeMarks: true,
        createdAt: true,
        question: {
          select: {
            id: true,
            title: true,
            type: true,
            difficulty: true,
            status: true,
            marks: true,
          },
        },
      },
    });
  }

  /**
   * Alias for findAssignedQuestions
   */
  async findAssessmentQuestions(assessmentId, tx) {
    return this.findAssignedQuestions(assessmentId, tx);
  }

  /**
   * Move sequences to temporary space during reorder to prevent sequence collision
   */
  async moveSequencesToTemporarySpace(tx, assessmentId, offset) {
    const db = getClient(tx);
    return db.assessmentQuestion.updateMany({
      where: {
        assessmentId,
      },
      data: {
        sequence: {
          increment: offset,
        },
      },
    });
  }

  /**
   * Update single question sequence position
   */
  async updateQuestionSequence(tx, assessmentId, questionId, sequence) {
    const db = getClient(tx);
    return db.assessmentQuestion.update({
      where: {
        assessmentId_questionId: {
          assessmentId,
          questionId,
        },
      },
      data: {
        sequence,
      },
    });
  }

  /**
   * Duplicate Assessment
   */
  async duplicate(tx, sourceAssessment, data) {
    const db = getClient(tx);
    return db.assessment.create({
      data: {
        title: data.title,
        description: sourceAssessment.description,
        instructions: sourceAssessment.instructions,
        durationMinutes: sourceAssessment.durationMinutes,
        passingScore: sourceAssessment.passingScore,
        maximumScore: sourceAssessment.maximumScore,
        maxAttempts: sourceAssessment.maxAttempts,
        type: sourceAssessment.type,
        difficulty: sourceAssessment.difficulty,
        status: "DRAFT",
        publishAt: null,
        startsAt: sourceAssessment.startsAt,
        endsAt: sourceAssessment.endsAt,
        createdById: data.createdById,
        deletedAt: null,
        questions: {
          create: (sourceAssessment.questions || []).map((item) => ({
            questionId: item.questionId || item.question?.id,
            sequence: item.sequence,
            marks: item.marks,
            negativeMarks: item.negativeMarks,
          })),
        },
      },
      select: ASSESSMENT_DETAIL_SELECT,
    });
  }
}

module.exports = new AssessmentRepository();
module.exports.ASSESSMENT_LIST_SELECT = ASSESSMENT_LIST_SELECT;
module.exports.ASSESSMENT_DETAIL_SELECT = ASSESSMENT_DETAIL_SELECT;
