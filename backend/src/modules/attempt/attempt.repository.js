const { prisma } = require("../../config/prisma");

/**
 * ==========================================================
 * Attempt Prisma Select Projections
 * ==========================================================
 */
const ATTEMPT_BASE_SELECT = Object.freeze({
  id: true,
  assessmentId: true,
  candidateId: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  submittedAt: true,
  score: true,
  maxScore: true,
  percentage: true,
  result: true,
  assessment: {
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      passingScore: true,
      maximumScore: true,
      type: true,
    },
  },
});

const ATTEMPT_QUESTION_SELECT = Object.freeze({
  attemptId: true,
  questionId: true,
  sequence: true,
  questionSnapshot: true,
  question: {
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      difficulty: true,
      options: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          optionText: true,
          sequence: true,
        },
      },
    },
  },
});

const ATTEMPT_ANSWER_SELECT = Object.freeze({
  id: true,
  attemptId: true,
  questionId: true,
  selectedOptionIds: true,
  answerText: true,
  evaluationStatus: true,
  isCorrect: true,
  marksAwarded: true,
  answeredAt: true,
  updatedAt: true,
});

/**
 * Helper to resolve database client (standalone Prisma OR active transaction client tx)
 */
const getClient = (tx) =>
  tx && typeof tx === "object" && (tx.candidateAttempt || tx.assessmentAttempt || tx.invitation || tx.assessment) ? tx : prisma;

/**
 * ==========================================================
 * Attempt Repository
 * ==========================================================
 * Pure Data Access Layer for AssessmentAttempt, AttemptQuestion,
 * AttemptAnswer, and Candidate Invitation models.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class AttemptRepository {
  /**
   * Find Attempt By ID
   */
  async findById(attemptId, options = {}, tx) {
    const db = getClient(tx);
    const { includeQuestions = false, includeAnswers = false } = options;
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;

    return attemptModel.findUnique({
      where: { id: attemptId },
      select: {
        ...ATTEMPT_BASE_SELECT,
        ...(includeQuestions
          ? {
              attemptQuestions: {
                orderBy: { sequence: "asc" },
                select: ATTEMPT_QUESTION_SELECT,
              },
            }
          : {}),
        ...(includeAnswers
          ? {
              answers: {
                select: ATTEMPT_ANSWER_SELECT,
              },
            }
          : {}),
      },
    });
  }

  /**
   * Find Attempt By Candidate + Assessment + Attempt Number
   */
  async findByAttemptNumber({ assessmentId, candidateId, attemptNumber }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.findFirst({
      where: {
        assessmentId,
        candidateId,
      },
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * Find Active Attempt (IN_PROGRESS)
   */
  async findActiveAttempt({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.findFirst({
      where: {
        assessmentId,
        candidateId,
        status: "IN_PROGRESS",
      },
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Current Active Attempt
   * ------------------------------------------------------------
   * Finds only the candidate's IN_PROGRESS attempt.
   * Candidate identity + assessment identity are both scoped.
   * ------------------------------------------------------------
   */
  async findCurrentAttempt({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.findFirst({
      where: {
        assessmentId,
        candidateId,
        status: "IN_PROGRESS",
      },
      include: {
        assessment: {
          select: {
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
          },
        },
        attemptQuestions: {
          orderBy: {
            sequence: "asc",
          },
          include: {
            question: {
              select: {
                id: true,
                title: true,
                content: true,
                type: true,
                difficulty: true,
                options: {
                  orderBy: {
                    sequence: "asc",
                  },
                  select: {
                    id: true,
                    optionText: true,
                    sequence: true,
                  },
                },
              },
            },
            answers: {
              select: {
                id: true,
                questionId: true,
                selectedOptionIds: true,
                answerText: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });
  }

  /**
   * Find Latest Attempt
   */
  async findLatestAttempt({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.findFirst({
      where: {
        assessmentId,
        candidateId,
      },
      orderBy: [
        { startedAt: "desc" },
      ],
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * Count Total Attempts by Candidate for an Assessment
   */
  async countAttempts({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.count({
      where: {
        assessmentId,
        candidateId,
      },
    });
  }

  /**
   * Create New Assessment Attempt
   */
  async createAttempt(data, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    const { attemptNumber: _attemptNumber, cancelledAt: _cancelledAt, passed: _passed, ...cleanData } = data || {};
    return attemptModel.create({
      data: cleanData,
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * Create Attempt Questions Bulk Snapshot
   */
  async createAttemptQuestions(data, tx) {
    const db = getClient(tx);
    return db.attemptQuestion.createMany({
      data,
      skipDuplicates: false,
    });
  }

  /**
   * Find Attempt Question By Question ID
   */
  async findAttemptQuestion({ attemptId, questionId }, tx) {
    const db = getClient(tx);
    return db.attemptQuestion.findUnique({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      select: ATTEMPT_QUESTION_SELECT,
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Attempt Question For Answer
   * ------------------------------------------------------------
   * The candidate can only answer a question that belongs
   * to THIS attempt snapshot.
   * IMPORTANT: isCorrect intentionally NOT selected.
   * ------------------------------------------------------------
   */
  async findAttemptQuestionForAnswer({ attemptId, questionId }, tx) {
    const db = getClient(tx);
    return db.attemptQuestion.findFirst({
      where: {
        attemptId,
        questionId,
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        sequence: true,
        marks: true,
        negativeMarks: true,
        question: {
          select: {
            id: true,
            type: true,
            options: {
              select: {
                id: true,
                sequence: true,
                // IMPORTANT: isCorrect intentionally NOT selected.
              },
              orderBy: {
                sequence: "asc",
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find All Attempt Questions for an Attempt
   */
  async findAttemptQuestions(attemptId, tx) {
    const db = getClient(tx);
    return db.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { sequence: "asc" },
      select: ATTEMPT_QUESTION_SELECT,
    });
  }

  /**
   * Find Submitted Answer
   */
  async findAnswer({ attemptId, questionId }, tx) {
    const db = getClient(tx);
    return db.attemptAnswer.findUnique({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      select: ATTEMPT_ANSWER_SELECT,
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Existing Attempt Answer
   * ------------------------------------------------------------
   */
  async findAttemptAnswer({ attemptId, questionId }, tx) {
    const db = getClient(tx);
    return db.attemptAnswer.findUnique({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        selectedOptionIds: true,
        answerText: true,
        answeredAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Upsert Answer for Autosave & Idempotency
   */
  async upsertAnswer({ attemptId, questionId, data }, tx) {
    const db = getClient(tx);
    return db.attemptAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      create: {
        attemptId,
        questionId,
        ...data,
      },
      update: {
        ...data,
      },
      select: ATTEMPT_ANSWER_SELECT,
    });
  }

  /**
   * ------------------------------------------------------------
   * Upsert Attempt Answer
   * ------------------------------------------------------------
   * Autosave requests can arrive repeatedly.
   * Same attempt + question: one row
   * New answer: update existing row
   * No duplicate answer rows.
   * ------------------------------------------------------------
   */
  async upsertAttemptAnswer(
    { attemptId, questionId, selectedOptionIds, answerText },
    tx
  ) {
    const db = getClient(tx);
    const answerModel = db.candidateAnswer || db.attemptAnswer;
    return answerModel.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      create: {
        attemptId,
        questionId,
        selectedOptionIds: selectedOptionIds ?? [],
        answerText: answerText ?? null,
        version: 1,
      },
      update: {
        selectedOptionIds: selectedOptionIds ?? [],
        answerText: answerText ?? null,
        version: {
          increment: 1,
        },
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        selectedOptionIds: true,
        answerText: true,
        version: true,
        answeredAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Find Answer By Attempt & Question
   */
  async findAttemptAnswer({ attemptId, questionId }, tx) {
    const db = getClient(tx);
    const answerModel = db.candidateAnswer || db.attemptAnswer;
    return answerModel.findUnique({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
    });
  }

  /**
   * Find Answer By ID
   */
  async findAttemptAnswerById({ answerId }, tx) {
    const db = getClient(tx);
    const answerModel = db.candidateAnswer || db.attemptAnswer;
    return answerModel.findUnique({
      where: { id: answerId },
    });
  }

  /**
   * Create Attempt Answer Atomically (Version = 1)
   */
  async createAttemptAnswer({ attemptId, questionId, selectedOptionIds, answerText }, tx) {
    const db = getClient(tx);
    const answerModel = db.candidateAnswer || db.attemptAnswer;
    return answerModel.create({
      data: {
        attemptId,
        questionId,
        selectedOptionIds: selectedOptionIds ?? [],
        answerText: answerText ?? null,
        version: 1,
      },
    });
  }

  /**
   * Update Answer Atomically With Version Control
   */
  async updateAnswerWithVersion({ answerId, expectedVersion, selectedOptionIds, answerText }, tx) {
    const db = getClient(tx);
    const answerModel = db.candidateAnswer || db.attemptAnswer;
    const where = { id: answerId };
    if (expectedVersion !== undefined && expectedVersion !== null) {
      where.version = expectedVersion;
    }
    const result = await answerModel.updateMany({
      where,
      data: {
        selectedOptionIds: selectedOptionIds ?? [],
        answerText: answerText ?? null,
        version: {
          increment: 1,
        },
      },
    });
    return result.count;
  }

  /**
   * Update Attempt Base Record
   */
  async updateAttempt(attemptId, data, tx) {
    const db = getClient(tx);
    return db.assessmentAttempt.update({
      where: { id: attemptId },
      data,
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * Update Attempt Status Conditionally
   */
  async updateStatus({ attemptId, fromStatus, toStatus, data = {} }, tx) {
    const db = getClient(tx);
    return db.assessmentAttempt.updateMany({
      where: {
        id: attemptId,
        status: fromStatus,
      },
      data: {
        status: toStatus,
        ...data,
      },
    });
  }

  /**
   * Submit Attempt Atomically (IN_PROGRESS -> SUBMITTED)
   */
  async submitAttempt({ attemptId, score, percentage, passed, result, submittedAt = new Date() }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    const updateData = {
      status: "SUBMITTED",
      submittedAt,
    };
    if (score !== undefined) updateData.score = score;
    if (percentage !== undefined) updateData.percentage = percentage;
    if (result !== undefined) {
      updateData.result = result;
    } else if (passed !== undefined) {
      updateData.result = passed ? "PASS" : "FAIL";
    }

    return attemptModel.updateMany({
      where: {
        id: attemptId,
        status: "IN_PROGRESS",
      },
      data: updateData,
    });
  }

  /**
   * Expire Attempt Atomically (IN_PROGRESS -> SUBMITTED)
   */
  async expireAttempt({ attemptId, expiredAt = new Date() }, tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.updateMany({
      where: {
        id: attemptId,
        status: "IN_PROGRESS",
        expiresAt: { lte: expiredAt },
      },
      data: {
        status: "SUBMITTED",
      },
    });
  }

  /**
   * Expire Attempt If Active
   */
  async expireAttemptIfActive(attemptId, expiredAt = new Date(), tx) {
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.updateMany({
      where: {
        id: attemptId,
        status: "IN_PROGRESS",
      },
      data: {
        status: "SUBMITTED",
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Active Attempt For Candidate
   * ------------------------------------------------------------
   * Lightweight method for candidate answer persistence / autosave.
   * ------------------------------------------------------------
   */
  async findActiveAttemptForCandidate({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    return db.assessmentAttempt.findFirst({
      where: {
        assessmentId,
        candidateId,
        status: "IN_PROGRESS",
      },
      select: {
        id: true,
        assessmentId: true,
        candidateId: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        expiresAt: true,
      },
      orderBy: {
        startedAt: "desc",
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Attempt For Update (Row-Level Locking)
   * ------------------------------------------------------------
   * Performs SELECT ... FOR UPDATE query within interactive transaction.
   * ------------------------------------------------------------
   */
  async findAttemptForUpdate({ attemptId, candidateId }, tx) {
    const db = getClient(tx);
    try {
      const rows = await db.$queryRaw`
        SELECT "id", "assessmentId", "candidateId", "status", "startedAt", "expiresAt", "submittedAt", "score", "percentage", "result"
        FROM "CandidateAttempt"
        WHERE "id" = ${attemptId}
          AND "candidateId" = ${candidateId}
        FOR UPDATE
      `;
      return rows[0] || null;
    } catch (_err) {
      const attemptModel = db.candidateAttempt || db.assessmentAttempt;
      return attemptModel.findFirst({
        where: { id: attemptId, candidateId },
      });
    }
  }

  /**
   * ------------------------------------------------------------
   * Lock Current Attempt Row
   * ------------------------------------------------------------
   * Performs SELECT ... FOR UPDATE query within interactive transaction.
   * ------------------------------------------------------------
   */
  async lockAttemptRow(attemptId, tx) {
    const db = getClient(tx);
    try {
      const rows = await db.$queryRaw`
        SELECT "id", "assessmentId", "candidateId", "status", "startedAt", "expiresAt", "submittedAt", "score", "percentage", "result"
        FROM "CandidateAttempt"
        WHERE "id" = ${attemptId}
        FOR UPDATE
      `;
      return rows[0] || null;
    } catch (_err) {
      const attemptModel = db.candidateAttempt || db.assessmentAttempt;
      return attemptModel.findFirst({
        where: {
          id: attemptId,
        },
        select: {
          id: true,
          assessmentId: true,
          candidateId: true,
          attemptNumber: true,
          status: true,
          startedAt: true,
          expiresAt: true,
          submittedAt: true,
        },
      });
    }
  }

  /**
   * ------------------------------------------------------------
   * Find Attempt By Primary Key ID
   * ------------------------------------------------------------
   */
  async findAttemptById(attemptId, tx) {
    if (!attemptId) return null;
    const db = getClient(tx);
    const attemptModel = db.candidateAttempt || db.assessmentAttempt;
    return attemptModel.findUnique({
      where: {
        id: attemptId,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Lock Current Attempt For Submission
   * ------------------------------------------------------------
   * Selects and validates active IN_PROGRESS attempt row for submission.
   * Concurrency-safe lookup within interactive transaction.
   * ------------------------------------------------------------
   */
  async lockAttemptForSubmission({ attemptId }, tx) {
    const db = getClient(tx);
    return db.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        status: "IN_PROGRESS",
      },
      select: {
        id: true,
        assessmentId: true,
        candidateId: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        submittedAt: true,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Persist Answer Evaluation Status & Marks
   * ------------------------------------------------------------
   */
  async persistAnswerEvaluation({ answerId, evaluationStatus, marksAwarded, isCorrect }, tx) {
    if (!answerId) return null;
    const db = getClient(tx);
    const updateData = {};
    if (evaluationStatus !== undefined) updateData.evaluationStatus = evaluationStatus;
    if (marksAwarded !== undefined) updateData.marksAwarded = marksAwarded;
    if (isCorrect !== undefined) updateData.isCorrect = isCorrect;

    return db.attemptAnswer.update({
      where: { id: answerId },
      data: updateData,
    });
  }

  /**
   * ------------------------------------------------------------
   * Load Evaluation Dataset
   * ------------------------------------------------------------
   * Loads full attempt snapshot for server-side auto-evaluation.
   * Includes question options with isCorrect flag ONLY inside
   * server transaction.
   * ------------------------------------------------------------
   */
  async findAttemptForEvaluation(attemptId, tx) {
    const client = tx || prisma;
    const attemptModel = client.candidateAttempt || client.assessmentAttempt;

    const attempt = await attemptModel.findUnique({
      where: {
        id: attemptId,
      },
      select: {
        id: true,
        assessmentId: true,
        candidateId: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        submittedAt: true,

        assessment: {
          select: {
            id: true,
            passingScore: true,
            maximumScore: true,
            status: true,
          },
        },

        attemptQuestions: {
          orderBy: {
            sequence: "asc",
          },
          select: {
            attemptId: true,
            questionId: true,
            sequence: true,
            questionSnapshot: true,
            answers: {
              select: {
                id: true,
                questionId: true,
                selectedOptionIds: true,
                answerText: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) return null;
    return {
      ...attempt,
      questions: attempt.attemptQuestions || [],
    };
  }

  /**
   * List Candidate Attempts (Paginated, Filtered, Sorted)
   */
  async listByCandidate({ candidateId, assessmentId, status, skip = 0, take = 10, orderBy = { createdAt: "desc" } }, tx) {
    const db = getClient(tx);
    const model = db.candidateAttempt || db.assessmentAttempt;
    const where = {
      candidateId,
      ...(assessmentId ? { assessmentId } : {}),
      ...(status ? { status } : {}),
    };

    return model.findMany({
      where,
      skip,
      take,
      orderBy,
      select: ATTEMPT_BASE_SELECT,
    });
  }

  /**
   * Count Candidate Attempts
   */
  async countByCandidate({ candidateId, assessmentId, status }, tx) {
    const db = getClient(tx);
    const model = db.candidateAttempt || db.assessmentAttempt;
    return model.count({
      where: {
        candidateId,
        ...(assessmentId ? { assessmentId } : {}),
        ...(status ? { status } : {}),
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Invitation By Token Hash
   * ------------------------------------------------------------
   * IMPORTANT: Raw token is NEVER queried against the database.
   * ------------------------------------------------------------
   */
  async findInvitationByTokenHash(tokenHash, tx) {
    const db = getClient(tx);
    return db.invitation.findUnique({
      where: {
        token: tokenHash,
      },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: {
                orderIndex: "asc",
              },
            },
          },
        },
        candidate: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Find Invitation By ID
   */
  async findInvitationById(id, tx) {
    const db = getClient(tx);
    return db.invitation.findUnique({
      where: {
        id,
      },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: {
                sequence: "asc",
              },
            },
          },
        },
        candidate: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Find Invitation By Candidate ID and Assessment ID
   */
  async findInvitationByCandidateAndAssessment({ candidateId, assessmentId }, tx) {
    const db = getClient(tx);
    return db.invitation.findFirst({
      where: {
        candidateId,
        assessmentId,
      },
      orderBy: {
        expiresAt: "desc",
      },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: {
                sequence: "asc",
              },
            },
          },
        },
        candidate: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Atomically Mark Invitation As Opened
   * ------------------------------------------------------------
   * Prevents two concurrent requests from both consuming the same invitation.
   * ------------------------------------------------------------
   */
  async markInvitationOpenedIfUsable(invitationId, now = new Date(), tx) {
    const db = getClient(tx);
    const result = await db.invitation.updateMany({
      where: {
        id: invitationId,
        status: {
          in: ["PENDING", "SENT"],
        },
        expiresAt: {
          gt: now,
        },
      },
      data: {
        status: "OPENED",
      },
    });

    return result.count === 1;
  }

  /**
   * ------------------------------------------------------------
   * Find Invitation By ID
   * ------------------------------------------------------------
   */
  async findInvitationById(id, tx) {
    const db = getClient(tx);
    return db.invitation.findUnique({
      where: { id },
    });
  }

  /**
   * ------------------------------------------------------------
   * Create Invitation
   * ------------------------------------------------------------
   */
  async createInvitation(data, tx) {
    const db = getClient(tx);
    return db.invitation.create({
      data,
    });
  }

  /**
   * ------------------------------------------------------------
   * Update Invitation Status
   * ------------------------------------------------------------
   */
  async updateInvitationStatus(id, status, tx) {
    const db = getClient(tx);
    const data = { status };
    if (status === "SENT") {
      data.sentAt = new Date();
    } else if (status === "OPENED") {
      data.openedAt = new Date();
    }
    return db.invitation.update({
      where: { id },
      data,
    });
  }

  /**
   * ------------------------------------------------------------
   * Mark Invitation Opened
   * ------------------------------------------------------------
   */
  async markInvitationOpened(id, tx) {
    const db = getClient(tx);
    return db.invitation.update({
      where: { id },
      data: { status: "OPENED" },
    });
  }

  /**
   * ------------------------------------------------------------
   * Mark Invitation Completed
   * ------------------------------------------------------------
   */
  async markInvitationCompleted(id, tx) {
    const db = getClient(tx);
    return db.invitation.updateMany({
      where: {
        id,
        status: {
          in: ["OPENED", "SENT", "PENDING"],
        },
      },
      data: {
        status: "COMPLETED",
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Mark Invitation Expired
   * ------------------------------------------------------------
   */
  async markInvitationExpired(id, tx) {
    const db = getClient(tx);
    return db.invitation.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Active Invitation for Candidate + Assessment
   * ------------------------------------------------------------
   */
  async findActiveInvitation({ assessmentId, candidateId }, tx) {
    const db = getClient(tx);
    return db.invitation.findFirst({
      where: {
        assessmentId,
        candidateId,
        status: {
          in: ["PENDING", "SENT", "OPENED"],
        },
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        expiresAt: "desc",
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Candidates by IDs
   * ------------------------------------------------------------
   */
  async findCandidatesByIds(candidateIds, tx) {
    const db = getClient(tx);
    return db.user.findMany({
      where: {
        id: { in: candidateIds },
        role: "CANDIDATE",
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Assessment For Result Access (HR Ownership Enforcement)
   * ------------------------------------------------------------
   */
  async findAssessmentForResultAccess(assessmentId, tx) {
    const client = tx || prisma;

    return client.assessment.findFirst({
      where: {
        id: assessmentId,
        deletedAt: null,
      },

      select: {
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
        startsAt: true,
        endsAt: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * List Assessment Results (Paginated for HR Dashboard)
   * ------------------------------------------------------------
   */
  async listAssessmentResults({ where, skip = 0, take = 10, orderBy }, tx) {
    const client = tx || prisma;

    const queryOptions = { where };
    if (typeof skip === "number" && !isNaN(skip)) queryOptions.skip = skip;
    if (typeof take === "number" && !isNaN(take)) queryOptions.take = take;
    if (orderBy) queryOptions.orderBy = orderBy;

    return client.assessmentAttempt.findMany({
      ...queryOptions,

      select: {
        id: true,

        assessmentId: true,

        candidateId: true,

        attemptNumber: true,

        status: true,

        startedAt: true,

        expiresAt: true,

        submittedAt: true,

        score: true,

        percentage: true,

        passed: true,

        createdAt: true,

        updatedAt: true,

        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Count Assessment Results (HR Dashboard Pagination)
   * ------------------------------------------------------------
   */
  async countAssessmentResults(where, tx) {
    const client = tx || prisma;

    return client.assessmentAttempt.count({
      where,
    });
  }

  /**
   * ------------------------------------------------------------
   * Count Attempts By Status (HR Analytics Dashboard)
   * ------------------------------------------------------------
   */
  async countAttemptsByStatus(where, tx) {
    const client = tx || prisma;

    return client.assessmentAttempt.groupBy({
      by: ["status"],

      where,

      _count: {
        _all: true,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Aggregate Submitted Scores (HR Analytics Dashboard)
   * ------------------------------------------------------------
   */
  async aggregateSubmittedScores(where, tx) {
    const client = tx || prisma;

    return client.assessmentAttempt.aggregate({
      where,

      _count: {
        _all: true,
      },

      _avg: {
        score: true,
        percentage: true,
      },

      _min: {
        score: true,
        percentage: true,
      },

      _max: {
        score: true,
        percentage: true,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Count Passed & Failed Attempts (HR Analytics Dashboard)
   * ------------------------------------------------------------
   */
  async countPassedAttempts(where, tx) {
    const client = tx || prisma;

    const [passed, failed] = await Promise.all([
      client.assessmentAttempt.count({
        where: {
          ...where,
          passed: true,
        },
      }),

      client.assessmentAttempt.count({
        where: {
          ...where,
          passed: false,
        },
      }),
    ]);

    return {
      passed,
      failed,
    };
  }

  /**
   * ------------------------------------------------------------
   * Question Performance Analytics (HR Dashboard Question-Level Stats)
   * ------------------------------------------------------------
   */
  async getQuestionPerformance(assessmentId, tx) {
    const client = tx || prisma;

    return client.attemptQuestion.findMany({
      where: {
        attempt: {
          assessmentId,
          status: "SUBMITTED",
        },
      },

      orderBy: {
        sequence: "asc",
      },

      select: {
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
          },
        },

        answers: {
          select: {
            evaluationStatus: true,
            isCorrect: true,
            marksAwarded: true,
          },
        },
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Find Detailed Attempt Result (HR/Admin Comprehensive Inspection)
   * ------------------------------------------------------------
   */
  async findAttemptResultDetail({ assessmentId, attemptId }, tx) {
    const client = tx || prisma;

    return client.assessmentAttempt.findFirst({
      where: {
        id: attemptId,

        assessmentId,
      },

      select: {
        id: true,

        assessmentId: true,

        candidateId: true,

        attemptNumber: true,

        status: true,

        startedAt: true,

        expiresAt: true,

        submittedAt: true,

        score: true,

        percentage: true,

        passed: true,

        createdAt: true,

        updatedAt: true,

        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },

        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            maximumScore: true,
            durationMinutes: true,
            type: true,
            difficulty: true,
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

                options: {
                  orderBy: {
                    sequence: "asc",
                  },

                  select: {
                    id: true,
                    optionText: true,
                    sequence: true,
                  },
                },
              },
            },

            answers: {
              select: {
                id: true,
                selectedOptionIds: true,
                answerText: true,
                evaluationStatus: true,
                isCorrect: true,
                marksAwarded: true,
                answeredAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Candidate OTP Persistence Methods
   * ------------------------------------------------------------
   */

  /**
   * Create Candidate OTP Record
   */
  async createCandidateOtp({ email, otpHash, purpose = "ASSESSMENT_VERIFICATION", maxAttempts = 3, expiresAt }, tx) {
    const client = tx || prisma;
    return client.candidateOtp.create({
      data: {
        email,
        otpHash,
        purpose,
        attemptsCount: 0,
        maxAttempts,
        expiresAt,
      },
    });
  }

  /**
   * Find Latest Active (Unverified & Unexpired) Candidate OTP
   */
  async findLatestCandidateOtp({ email, purpose = "ASSESSMENT_VERIFICATION", now = new Date() }, tx) {
    const client = tx || prisma;
    return client.candidateOtp.findFirst({
      where: {
        email,
        purpose,
        verifiedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Find Latest OTP Record Regardless of Expiry
   */
  async findLatestCandidateOtpRecord({ email, purpose = "ASSESSMENT_VERIFICATION" }, tx) {
    const client = tx || prisma;
    return client.candidateOtp.findFirst({
      where: {
        email,
        purpose,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Find Recent OTP Request for Resend Cooldown Check
   */
  async findRecentCandidateOtp(options, tx) {
    const client = tx || prisma;
    const email = options?.email;
    const purpose = options?.purpose || "ASSESSMENT_VERIFICATION";
    const now = options?.now || new Date();
    const since = options?.since || (options?.secondsAgo ? new Date(now.getTime() - options.secondsAgo * 1000) : new Date(now.getTime() - 60000));

    return client.candidateOtp.findFirst({
      where: {
        email,
        purpose,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  /**
   * Count Candidate OTP Requests within Time Window for Rate Limiting
   */
  async countCandidateOtpRequests(options, tx) {
    const client = tx || prisma;
    const email = options?.email;
    const purpose = options?.purpose || "ASSESSMENT_VERIFICATION";
    const now = options?.now || new Date();
    const since = options?.since || (options?.hoursAgo ? new Date(now.getTime() - options.hoursAgo * 3600 * 1000) : new Date(now.getTime() - 3600000));

    return client.candidateOtp.count({
      where: {
        email,
        purpose,
        createdAt: {
          gte: since,
        },
      },
    });
  }

  /**
   * Increment Failed Attempts Count (Atomic Update)
   */
  async incrementOtpAttempts(optionsOrId, tx) {
    const client = tx || prisma;
    const id = typeof optionsOrId === "object" ? optionsOrId.id : optionsOrId;
    const now = typeof optionsOrId === "object" && optionsOrId.now ? optionsOrId.now : new Date();

    return client.candidateOtp.updateMany({
      where: {
        id,
        verifiedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        attemptsCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Mark OTP Verified Atomically (Prevents Concurrency Double Verification)
   */
  async markCandidateOtpVerified(optionsOrId, tx) {
    const client = tx || prisma;
    const id = typeof optionsOrId === "object" ? optionsOrId.id : optionsOrId;
    const verifiedAt = typeof optionsOrId === "object" && optionsOrId.verifiedAt ? optionsOrId.verifiedAt : new Date();
    const now = typeof optionsOrId === "object" && optionsOrId.now ? optionsOrId.now : new Date();

    return client.candidateOtp.updateMany({
      where: {
        id,
        verifiedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        verifiedAt,
      },
    });
  }

  /**
   * Invalidate Candidate OTP (Expire Immediately)
   */
  async invalidateCandidateOtp(optionsOrId, tx) {
    const client = tx || prisma;
    const id = typeof optionsOrId === "object" ? optionsOrId.id : optionsOrId;
    const now = typeof optionsOrId === "object" && optionsOrId.now ? optionsOrId.now : new Date();

    return client.candidateOtp.updateMany({
      where: {
        id,
        verifiedAt: null,
      },
      data: {
        expiresAt: now,
      },
    });
  }

  /**
   * ------------------------------------------------------------
   * Candidate Verification Session Persistence Methods
   * ------------------------------------------------------------
   */

  /**
   * Create Candidate Verification Session Record
   */
  async createVerificationSession({ candidateId, assessmentId, tokenHash, expiresAt }, tx) {
    const client = tx || prisma;
    return client.candidateVerificationSession.create({
      data: {
        candidateId,
        assessmentId,
        tokenHash,
        expiresAt,
      },
    });
  }

  /**
   * Find Active Candidate Verification Session by Token Hash
   */
  async findVerificationSessionByTokenHash(tokenHash, now = new Date(), tx) {
    const client = tx || prisma;
    return client.candidateVerificationSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  /**
   * Find Active Candidate Verification Session by Token Hash
   */
  async findActiveVerificationSession(optionsOrTokenHash, tx) {
    try {
      const client = tx || prisma;
      const tokenHash = typeof optionsOrTokenHash === "object" ? optionsOrTokenHash.tokenHash : optionsOrTokenHash;
      const now = typeof optionsOrTokenHash === "object" && optionsOrTokenHash.now ? optionsOrTokenHash.now : new Date();

      return await client.candidateVerificationSession.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Touch Verification Session (Update Last Used At)
   */
  async touchVerificationSession(optionsOrId, tx) {
    const client = tx || prisma;
    const id = typeof optionsOrId === "object" ? optionsOrId.id : optionsOrId;
    const lastUsedAt = typeof optionsOrId === "object" && optionsOrId.lastUsedAt ? optionsOrId.lastUsedAt : new Date();

    return client.candidateVerificationSession.updateMany({
      where: {
        id,
        revokedAt: null,
        expiresAt: {
          gt: lastUsedAt,
        },
      },
      data: {
        lastUsedAt,
      },
    });
  }

  /**
   * Revoke Candidate Verification Session
   */
  async revokeVerificationSession(optionsOrId, tx) {
    const client = tx || prisma;
    const id = typeof optionsOrId === "object" ? optionsOrId.id : optionsOrId;
    const revokedAt = typeof optionsOrId === "object" && optionsOrId.revokedAt ? optionsOrId.revokedAt : new Date();

    return client.candidateVerificationSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  /**
   * Expire Attempt If Active (Atomic Status Transition)
   */
  async expireAttemptIfActive(idOrObj, now = new Date(), tx) {
    const id = typeof idOrObj === "object" ? idOrObj.id : idOrObj;
    const effectiveNow = typeof idOrObj === "object" ? (idOrObj.now || now) : now;
    const client = (typeof idOrObj === "object" && idOrObj.tx) ? idOrObj.tx : (tx || prisma);
    const attemptModel = client.candidateAttempt || client.assessmentAttempt;

    return attemptModel.updateMany({
      where: {
        id,
        status: "IN_PROGRESS",
        expiresAt: {
          lte: effectiveNow,
        },
      },
      data: {
        status: "SUBMITTED",
      },
    });
  }

  async findCurrentAttempt({ candidateAssessmentId, candidateId, assessmentId }, tx) {
    try {
      const client = tx || prisma;
      const where = { status: "IN_PROGRESS" };

      if (candidateId) {
        where.candidateId = candidateId;
      }
      if (assessmentId) {
        where.assessmentId = assessmentId;
      }

      if (candidateAssessmentId && (!where.candidateId || !where.assessmentId)) {
        const candidateAssessment = await client.candidateAssessment.findUnique({
          where: { id: candidateAssessmentId },
          select: { candidateId: true, assessmentId: true },
        });
        if (candidateAssessment) {
          where.candidateId = candidateAssessment.candidateId;
          where.assessmentId = candidateAssessment.assessmentId;
        } else {
          const invitation = await client.invitation.findUnique({
            where: { id: candidateAssessmentId },
            select: { candidateId: true, assessmentId: true },
          });
          if (invitation) {
            where.candidateId = invitation.candidateId;
            where.assessmentId = invitation.assessmentId;
          } else {
            return null;
          }
        }
      }

      const attemptModel = client.candidateAttempt || client.assessmentAttempt;
      return await attemptModel.findFirst({
        where,
        include: {
          assessment: {
            select: {
              id: true,
              title: true,
              durationMinutes: true,
              maximumScore: true,
            },
          },
        },
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Find Attempt Question by ID & Attempt ID
   */
  async findAttemptQuestion({ id, questionId, attemptId }, tx) {
    const client = tx || prisma;
    const where = { attemptId };
    if (id) {
      where.id = id;
    }
    if (questionId) {
      where.questionId = questionId;
    }

    return client.attemptQuestion.findFirst({
      where,
      include: {
        question: {
          include: {
            options: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find Answer for Evaluation
   */
  async findAnswerForEvaluation({ attemptAnswerId }, tx) {
    const client = tx || prisma;
    return client.attemptAnswer.findUnique({
      where: { id: attemptAnswerId },
      include: {
        attempt: {
          include: {
            assessment: {
              select: {
                id: true,
                maximumScore: true,
                passingScore: true,
              },
            },
          },
        },
        question: {
          select: {
            id: true,
            type: true,
          },
        },
      },
    });
  }

  /**
   * Find Attempt Question by Answer ID
   */
  async findAttemptQuestionByAnswer({ attemptAnswerId }, tx) {
    const client = tx || prisma;
    return client.attemptQuestion.findFirst({
      where: {
        answers: {
          some: {
            id: attemptAnswerId,
          },
        },
      },
      select: {
        id: true,
        marks: true,
      },
    });
  }

  /**
   * Evaluate Attempt Answer
   */
  async evaluateAttemptAnswer({ id, evaluationStatus, marksAwarded }, tx) {
    const client = tx || prisma;
    return client.attemptAnswer.update({
      where: { id },
      data: {
        evaluationStatus,
        isCorrect: evaluationStatus === "CORRECT",
        marksAwarded,
      },
    });
  }

  /**
   * Find Attempt Answers for Recalculation
   */
  async findAttemptAnswersForRecalculation({ attemptId }, tx) {
    const client = tx || prisma;
    return client.attemptAnswer.findMany({
      where: { attemptId },
      select: {
        id: true,
        evaluationStatus: true,
        marksAwarded: true,
      },
    });
  }

  /**
   * Update Attempt Evaluation
   */
  async updateAttemptEvaluation({ id, score, percentage, passed }, tx) {
    const client = tx || prisma;
    return client.assessmentAttempt.update({
      where: { id },
      data: {
        score,
        percentage,
        passed,
      },
    });
  }

  /**
   * List Attempts for HR Dashboard (Paginated)
   */
  async listAttemptsForHR({ where, skip, take, orderBy }, tx) {
    const client = tx || prisma;
    const model = client.candidateAttempt || client.assessmentAttempt;
    const cleanOrderBy = orderBy?.createdAt ? { startedAt: orderBy.createdAt } : orderBy;
    return model.findMany({
      where,
      skip,
      take,
      orderBy: cleanOrderBy || { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        expiresAt: true,
        score: true,
        maxScore: true,
        percentage: true,
        result: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assessment: {
          select: {
            id: true,
            title: true,
            maximumScore: true,
            passingScore: true,
          },
        },
      },
    });
  }

  /**
   * Count Attempts for HR Dashboard
   */
  async countAttemptsForHR({ where }, tx) {
    const client = tx || prisma;
    const model = client.candidateAttempt || client.assessmentAttempt;
    const countWhere = { ...where };
    delete countWhere.skip;
    delete countWhere.take;
    delete countWhere.orderBy;
    delete countWhere.cursor;
    return model.count({ where: countWhere });
  }

  /**
   * Aggregate Assessment Analytics (DB-side Aggregations)
   */
  async getAssessmentAnalytics({ assessmentId, from, to }, tx) {
    const client = tx || prisma;
    const model = client.candidateAttempt || client.assessmentAttempt;
    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.gte = from;
      if (to) dateFilter.createdAt.lte = to;
    }
    const where = { assessmentId, ...dateFilter };

    const [totalAttempts, submittedAttempts, passedAttempts, failedAttempts, scoreAggregate] = await Promise.all([
      model.count({ where }),
      model.count({ where: { ...where, status: "SUBMITTED" } }),
      model.count({ where: { ...where, status: "SUBMITTED", passed: true } }),
      model.count({ where: { ...where, status: "SUBMITTED", passed: false } }),
      model.aggregate({
        where: { ...where, status: "SUBMITTED" },
        _avg: { score: true, percentage: true },
        _max: { score: true, percentage: true },
        _min: { score: true, percentage: true },
      }),
    ]);

    return {
      totalAttempts,
      submittedAttempts,
      passedAttempts,
      failedAttempts,
      scoreAggregate,
    };
  }

  /**
   * Find Detailed Attempt for HR Review
   */
  async findAttemptForHR({ attemptId }, tx) {
    const client = tx || prisma;
    const model = client.candidateAttempt || client.assessmentAttempt;
    return model.findUnique({
      where: { id: attemptId },
      include: {
        assessment: true,
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        questions: {
          orderBy: { sequence: "asc" },
          include: {
            answers: true,
          },
        },
      },
    });
  }

  /**
   * Lock Invitation Row with FOR UPDATE (Pessimistic Concurrency Protection)
   */
  async lockInvitationRow(invitationId, tx) {
    const client = tx || prisma;
    try {
      const rows = await client.$queryRaw`
        SELECT id FROM "Invitation"
        WHERE id = ${invitationId}
        FOR UPDATE
      `;
      return rows[0] || null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Lock Candidate Assessment Row with FOR UPDATE
   */
  async lockCandidateAssessment({ candidateId, assessmentId, candidateAssessmentId }, tx) {
    const client = tx || prisma;
    try {
      if (candidateAssessmentId) {
        const rows = await client.$queryRaw`
          SELECT id FROM "Invitation"
          WHERE id = ${candidateAssessmentId}
          FOR UPDATE
        `;
        if (rows[0]) return rows[0];
      }
      const rows = await client.$queryRaw`
        SELECT id FROM "Invitation"
        WHERE "candidateId" = ${candidateId} AND "assessmentId" = ${assessmentId}
        FOR UPDATE
      `;
      return rows[0] || null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Transaction Helper
   */
  async transaction(callback) {
    return prisma.$transaction(async (tx) => callback(tx));
  }
}

const attemptRepository = new AttemptRepository();
module.exports = attemptRepository;
module.exports.ATTEMPT_BASE_SELECT = ATTEMPT_BASE_SELECT;
module.exports.ATTEMPT_QUESTION_SELECT = ATTEMPT_QUESTION_SELECT;
module.exports.ATTEMPT_ANSWER_SELECT = ATTEMPT_ANSWER_SELECT;

// Method references for destructuring compatibility
module.exports.lockInvitationRow = attemptRepository.lockInvitationRow.bind(attemptRepository);
module.exports.lockCandidateAssessment = attemptRepository.lockCandidateAssessment.bind(attemptRepository);
module.exports.findAssessmentForResultAccess = attemptRepository.findAssessmentForResultAccess.bind(attemptRepository);
module.exports.listAssessmentResults = attemptRepository.listAssessmentResults.bind(attemptRepository);
module.exports.countAssessmentResults = attemptRepository.countAssessmentResults.bind(attemptRepository);
module.exports.countAttemptsByStatus = attemptRepository.countAttemptsByStatus.bind(attemptRepository);
module.exports.aggregateSubmittedScores = attemptRepository.aggregateSubmittedScores.bind(attemptRepository);
module.exports.countPassedAttempts = attemptRepository.countPassedAttempts.bind(attemptRepository);
module.exports.getQuestionPerformance = attemptRepository.getQuestionPerformance.bind(attemptRepository);
module.exports.findAttemptResultDetail = attemptRepository.findAttemptResultDetail.bind(attemptRepository);

module.exports.createCandidateOtp = attemptRepository.createCandidateOtp.bind(attemptRepository);
module.exports.findLatestCandidateOtp = attemptRepository.findLatestCandidateOtp.bind(attemptRepository);
module.exports.findLatestCandidateOtpRecord = attemptRepository.findLatestCandidateOtpRecord.bind(attemptRepository);
module.exports.findRecentCandidateOtp = attemptRepository.findRecentCandidateOtp.bind(attemptRepository);
module.exports.countCandidateOtpRequests = attemptRepository.countCandidateOtpRequests.bind(attemptRepository);
module.exports.incrementOtpAttempts = attemptRepository.incrementOtpAttempts.bind(attemptRepository);
module.exports.markCandidateOtpVerified = attemptRepository.markCandidateOtpVerified.bind(attemptRepository);
module.exports.invalidateCandidateOtp = attemptRepository.invalidateCandidateOtp.bind(attemptRepository);

module.exports.createVerificationSession = attemptRepository.createVerificationSession.bind(attemptRepository);
module.exports.findVerificationSessionByTokenHash = attemptRepository.findVerificationSessionByTokenHash.bind(attemptRepository);
module.exports.findActiveVerificationSession = attemptRepository.findActiveVerificationSession.bind(attemptRepository);
module.exports.touchVerificationSession = attemptRepository.touchVerificationSession.bind(attemptRepository);
module.exports.revokeVerificationSession = attemptRepository.revokeVerificationSession.bind(attemptRepository);

module.exports.expireAttemptIfActive = attemptRepository.expireAttemptIfActive.bind(attemptRepository);
module.exports.findCurrentAttempt = attemptRepository.findCurrentAttempt.bind(attemptRepository);
module.exports.findAttemptById = attemptRepository.findAttemptById.bind(attemptRepository);
module.exports.lockAttemptRow = attemptRepository.lockAttemptRow.bind(attemptRepository);
module.exports.findAttemptForUpdate = attemptRepository.findAttemptForUpdate.bind(attemptRepository);
module.exports.findAttemptQuestion = attemptRepository.findAttemptQuestion.bind(attemptRepository);
module.exports.findAttemptAnswer = attemptRepository.findAttemptAnswer.bind(attemptRepository);
module.exports.findAttemptAnswerById = attemptRepository.findAttemptAnswerById.bind(attemptRepository);
module.exports.createAttemptAnswer = attemptRepository.createAttemptAnswer.bind(attemptRepository);
module.exports.updateAnswerWithVersion = attemptRepository.updateAnswerWithVersion.bind(attemptRepository);

module.exports.findAnswerForEvaluation = attemptRepository.findAnswerForEvaluation.bind(attemptRepository);
module.exports.findAttemptQuestionByAnswer = attemptRepository.findAttemptQuestionByAnswer.bind(attemptRepository);
module.exports.evaluateAttemptAnswer = attemptRepository.evaluateAttemptAnswer.bind(attemptRepository);
module.exports.findAttemptAnswersForRecalculation = attemptRepository.findAttemptAnswersForRecalculation.bind(attemptRepository);
module.exports.updateAttemptEvaluation = attemptRepository.updateAttemptEvaluation.bind(attemptRepository);

module.exports.listAttemptsForHR = attemptRepository.listAttemptsForHR.bind(attemptRepository);
module.exports.countAttemptsForHR = attemptRepository.countAttemptsForHR.bind(attemptRepository);
module.exports.getAssessmentAnalytics = attemptRepository.getAssessmentAnalytics.bind(attemptRepository);
module.exports.findAttemptForHR = attemptRepository.findAttemptForHR.bind(attemptRepository);
module.exports.findInvitationById = attemptRepository.findInvitationById.bind(attemptRepository);
module.exports.findInvitationByCandidateAndAssessment = attemptRepository.findInvitationByCandidateAndAssessment.bind(attemptRepository);
