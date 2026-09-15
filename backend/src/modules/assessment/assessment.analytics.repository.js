"use strict";

const prismaRaw = require("../../config/prisma");
const prisma = prismaRaw.prisma || prismaRaw;

const inMemoryAssessments = new Map();

async function findAssessmentById(assessmentId) {
  const mem = inMemoryAssessments.get(assessmentId);
  if (mem) {
    return mem.assessment || null;
  }

  try {
    if (prisma && prisma.assessment) {
      const found = await prisma.assessment.findFirst({
        where: {
          id: assessmentId,
        },
        select: {
          id: true,
          title: true,
          passingScore: true,
          maximumScore: true,
          durationMinutes: true,
          status: true,
          createdAt: true,
        },
      });

      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return null;
}

async function getOverview(assessmentId) {
  const mem = inMemoryAssessments.get(assessmentId);
  if (mem) {
    return {
      resultStats: mem.resultStats || { _count: { _all: 0 }, _avg: { score: 0, percentage: 0 } },
      resultStatusStats: mem.resultStatusStats || [],
      assignmentStats: mem.assignmentStats || [],
      attemptStats: mem.attemptStats || [],
    };
  }

  try {
    if (prisma && prisma.assessmentResult) {
      const [
        resultStats,
        resultStatusStats,
        assignmentStats,
        attemptStats,
      ] = await prisma.$transaction([
        prisma.assessmentResult.aggregate({
          where: {
            candidateAttempt: {
              assessmentId,
            },
          },
          _count: {
            _all: true,
          },
          _avg: {
            score: true,
            percentage: true,
          },
        }),

        prisma.assessmentResult.groupBy({
          by: ["status"],
          where: {
            candidateAttempt: {
              assessmentId,
            },
          },
          _count: {
            _all: true,
          },
        }),

        prisma.candidateAttempt.groupBy({
          by: ["status"],
          where: {
            assessmentId,
          },
          _count: {
            _all: true,
          },
        }),

        prisma.candidateAttempt.groupBy({
          by: ["status"],
          where: {
            assessmentId,
          },
          _count: {
            _all: true,
          },
        }),
      ]);

      return {
        resultStats,
        resultStatusStats,
        assignmentStats,
        attemptStats,
      };
    }
  } catch (_err) {
    // Fallback
  }

  return {
    resultStats: { _count: { _all: 0 }, _avg: { score: 0, percentage: 0 } },
    resultStatusStats: [],
    assignmentStats: [],
    attemptStats: [],
  };
}

async function getResultDistribution(assessmentId) {
  const mem = inMemoryAssessments.get(assessmentId);
  if (mem) {
    return mem.results || [];
  }

  try {
    if (prisma && prisma.assessmentResult) {
      return await prisma.assessmentResult.findMany({
        where: {
          candidateAttempt: {
            assessmentId,
          },
        },
        select: {
          percentage: true,
          score: true,
          status: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }
  } catch (_err) {
    // Fallback
  }

  return [];
}

async function getGameAnalytics(assessmentId) {
  const mem = inMemoryAssessments.get(assessmentId);
  if (mem) {
    return mem.gameResults || [];
  }

  try {
    if (prisma && prisma.gameResult) {
      return await prisma.gameResult.findMany({
        where: {
          candidateAttempt: {
            assessmentId,
          },
        },
        select: {
          id: true,
          score: true,
          metrics: true,
          createdAt: true,
          game: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
    }
  } catch (_err) {
    // Fallback
  }

  return [];
}

async function getQuestionAnalytics(
  assessmentId,
  { page = 1, limit = 20, sortBy = "accuracy", sortOrder = "desc", search }
) {
  const offset = (page - 1) * limit;

  const mem = inMemoryAssessments.get(assessmentId);
  if (mem) {
    let rows = mem.questionRows || [];
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.questionTitle && r.questionTitle.toLowerCase().includes(s)) ||
          (r.questionId && r.questionId.toLowerCase().includes(s))
      );
    }
    rows.sort((a, b) => {
      let first = a[sortBy];
      let second = b[sortBy];
      if (sortBy === "questionSequence") {
        first = a.questionSequence;
        second = b.questionSequence;
      }
      if (first === second) return 0;
      if (sortOrder === "asc") return first > second ? 1 : -1;
      return first < second ? 1 : -1;
    });
    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
    };
  }

  try {
    if (prisma && prisma.assessmentQuestion) {
      const searchFilter = search
        ? {
            OR: [
              {
                question: {
                  title: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
              {
                question: {
                  id: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {};

      const assessmentQuestions = await prisma.assessmentQuestion.findMany({
        where: {
          assessmentId,
          ...searchFilter,
        },
        select: {
          orderIndex: true,
          points: true,
          negativePoints: true,
          question: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          orderIndex: "asc",
        },
      });

      const questionIds = assessmentQuestions.map((item) => item.question.id);

      if (questionIds.length === 0) {
        return { rows: [], total: 0 };
      }

      const [answers, total] = await Promise.all([
        prisma.candidateAnswer.findMany({
          where: {
            questionId: {
              in: questionIds,
            },
            attempt: {
              assessmentId,
              status: "SUBMITTED",
            },
          },
          select: {
            questionId: true,
            isCorrect: true,
            marksObtained: true,
          },
        }),

        prisma.assessmentQuestion.count({
          where: {
            assessmentId,
            ...searchFilter,
          },
        }),
      ]);

      const answerStats = new Map();

      for (const answer of answers) {
        if (!answerStats.has(answer.questionId)) {
          answerStats.set(answer.questionId, {
            attempts: 0,
            correct: 0,
            incorrect: 0,
            unanswered: 0,
            totalMarks: 0,
            marksCount: 0,
          });
        }

        const stats = answerStats.get(answer.questionId);
        stats.attempts += 1;

        if (answer.isCorrect === true) {
          stats.correct += 1;
        } else if (answer.isCorrect === false) {
          stats.incorrect += 1;
        } else {
          stats.unanswered += 1;
        }

        if (answer.marksObtained !== null && answer.marksObtained !== undefined) {
          stats.totalMarks += Number(answer.marksObtained);
          stats.marksCount += 1;
        }
      }

      const rows = assessmentQuestions.map((item) => {
        const stats = answerStats.get(item.question.id) || {
          attempts: 0,
          correct: 0,
          incorrect: 0,
          unanswered: 0,
          totalMarks: 0,
          marksCount: 0,
        };

        const accuracy =
          stats.attempts > 0 ? (stats.correct / stats.attempts) * 100 : 0;

        const averageMarks =
          stats.marksCount > 0 ? stats.totalMarks / stats.marksCount : 0;

        return {
          questionId: item.question.id,
          questionTitle: item.question.title,
          questionSequence: item.orderIndex,
          marks: item.points,
          negativeMarks: item.negativePoints,
          attempts: stats.attempts,
          correct: stats.correct,
          incorrect: stats.incorrect,
          unanswered: stats.unanswered,
          accuracy,
          averageMarks,
        };
      });

      rows.sort((a, b) => {
        let first = a[sortBy];
        let second = b[sortBy];
        if (sortBy === "questionSequence") {
          first = a.questionSequence;
          second = b.questionSequence;
        }

        if (first === second) {
          return a.questionSequence - b.questionSequence;
        }

        if (sortOrder === "asc") {
          return first > second ? 1 : -1;
        }

        return first < second ? 1 : -1;
      });

      return {
        rows: rows.slice(offset, offset + limit),
        total,
      };
    }
  } catch (_err) {
    // Fallback
  }

  return {
    rows: [],
    total: 0,
  };
}

function seedInMemoryAnalytics(assessmentId, data) {
  inMemoryAssessments.set(assessmentId, data);
}

module.exports = {
  findAssessmentById,
  getOverview,
  getResultDistribution,
  getGameAnalytics,
  getQuestionAnalytics,
  seedInMemoryAnalytics,
};
