"use strict";

const { prisma } = require("../../config/prisma");

const inMemoryAssessmentResults = new Map();

async function findCandidateAssessmentForScoring(candidateAssessmentId) {
  try {
    if (!prisma.candidateAttempt) return null;
    const found = await prisma.candidateAttempt.findUnique({
      where: {
        id: candidateAssessmentId,
      },
      include: {
        assessment: {
          select: {
            id: true,
            maximumScore: true,
            passingScore: true,
            games: {
              select: {
                gameId: true,
                sequence: true,
                weight: true,
              },
            },
          },
        },
        answers: {
          select: {
            marksAwarded: true,
            isCorrect: true,
          },
        },
        gameResults: {
          select: {
            gameId: true,
            score: true,
          },
        },
        assessmentResult: true,
      },
    });
    return found;
  } catch (_err) {
    return null;
  }
}

async function createAssessmentResult({ candidateAssessmentId, score, percentage, status }) {
  const resultObj = {
    id: `res_ass_${Date.now()}`,
    candidateAssessmentId,
    score,
    percentage,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    if (!prisma.assessmentResult) {
      inMemoryAssessmentResults.set(candidateAssessmentId, resultObj);
      return resultObj;
    }
    const created = await prisma.assessmentResult.upsert({
      where: {
        candidateAssessmentId,
      },
      create: {
        candidateAssessmentId,
        score,
        percentage,
        status,
      },
      update: {
        score,
        percentage,
        status,
      },
    });
    inMemoryAssessmentResults.set(candidateAssessmentId, created);
    return created;
  } catch (_err) {
    inMemoryAssessmentResults.set(candidateAssessmentId, resultObj);
    return resultObj;
  }
}

async function updateCandidateAssessmentResult({ candidateAssessmentId, status }) {
  try {
    if (!prisma.candidateAttempt) return null;
    return await prisma.candidateAttempt.update({
      where: {
        id: candidateAssessmentId,
      },
      data: {
        status: status || "COMPLETED",
        submittedAt: new Date(),
      },
    });
  } catch (_err) {
    return null;
  }
}

module.exports = {
  findCandidateAssessmentForScoring,
  createAssessmentResult,
  updateCandidateAssessmentResult,
};
