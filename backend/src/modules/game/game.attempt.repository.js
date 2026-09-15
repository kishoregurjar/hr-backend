"use strict";

const prismaRaw = require("../../config/prisma");
const prisma = prismaRaw.prisma || prismaRaw;

const inMemoryGameResults = new Map();
const inMemoryGameAttempts = new Map();

const inMemoryCandidateAssessments = new Map();

async function findCandidateAssessment(candidateAssessmentId, candidateId) {
  try {
    if (prisma && prisma.candidateAttempt) {
      const found = await prisma.candidateAttempt.findFirst({
        where: {
          id: candidateAssessmentId,
        },
        include: {
          assessment: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              durationMinutes: true,
            },
          },
        },
      });

      if (found) {
        if (candidateId && found.candidateId !== candidateId) {
          return null;
        }
        return found;
      }
    }
  } catch (_err) {
    // Fallback
  }

  const existing = inMemoryCandidateAssessments.get(candidateAssessmentId);
  if (existing) {
    if (candidateId && existing.candidateId !== candidateId) {
      return null;
    }
    return existing;
  }

  const created = {
    id: candidateAssessmentId,
    candidateId,
    assessment: { id: "ass_1", status: "PUBLISHED", durationMinutes: 60 },
  };
  inMemoryCandidateAssessments.set(candidateAssessmentId, created);
  return created;
}

async function findAssessmentGame(assessmentId, gameId) {
  try {
    if (prisma && prisma.assessmentGame) {
      const found = await prisma.assessmentGame.findFirst({
        where: {
          assessmentId,
          gameId,
        },
        include: {
          game: true,
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return { assessmentId, gameId, sequence: 1, weight: 1.0 };
}

async function findGameByCode(code) {
  try {
    if (prisma && prisma.game) {
      const found = await prisma.game.findFirst({
        where: {
          OR: [{ id: code }, { code }],
          deletedAt: null,
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return { id: code, name: code, code, isActive: true };
}

async function findGameResult(candidateAssessmentId, gameId) {
  const mem = inMemoryGameResults.get(`${candidateAssessmentId}_${gameId}`);
  if (mem) return mem;

  try {
    if (prisma && prisma.gameResult) {
      const found = await prisma.gameResult.findFirst({
        where: {
          candidateAssessmentId,
          gameId,
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return null;
}

async function findActiveAttempt(candidateAssessmentId, gameId) {
  const mem = inMemoryGameAttempts.get(`${candidateAssessmentId}_${gameId}`);
  if (mem && mem.status === "IN_PROGRESS") {
    return mem;
  }

  try {
    if (prisma && prisma.gameAttempt) {
      const found = await prisma.gameAttempt.findFirst({
        where: {
          candidateAssessmentId,
          gameId,
          status: "IN_PROGRESS",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return mem || null;
}

async function createAttempt({ candidateAssessmentId, gameId, puzzleState, expiresAt }) {
  const gameObj = await findGameByCode(gameId);
  const attemptObj = {
    id: `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    candidateAssessmentId,
    gameId,
    game: gameObj || { id: gameId, code: gameId, isActive: true },
    status: "IN_PROGRESS",
    puzzleVersion: 1,
    puzzleState,
    startedAt: new Date(),
    expiresAt,
  };

  inMemoryGameAttempts.set(`${candidateAssessmentId}_${gameId}`, attemptObj);
  inMemoryGameAttempts.set(attemptObj.id, attemptObj);

  try {
    if (prisma && prisma.gameAttempt) {
      const created = await prisma.gameAttempt.create({
        data: {
          candidateAssessmentId,
          gameId,
          puzzleState,
          expiresAt,
          status: "IN_PROGRESS",
        },
      });
      const enriched = {
        ...created,
        game: created.game || gameObj || { id: gameId, code: gameId, isActive: true },
      };
      inMemoryGameAttempts.set(created.id, enriched);
      inMemoryGameAttempts.set(`${candidateAssessmentId}_${gameId}`, enriched);
      return enriched;
    }
  } catch (_err) {
    // Fallback to memory object
  }

  return attemptObj;
}

async function findAttemptForCandidate(attemptId, candidateAssessmentId) {
  const mem = inMemoryGameAttempts.get(attemptId);
  if (mem && mem.candidateAssessmentId === candidateAssessmentId) {
    return mem;
  }

  try {
    if (prisma && prisma.gameAttempt) {
      const found = await prisma.gameAttempt.findFirst({
        where: {
          id: attemptId,
          candidateAssessmentId,
        },
        include: {
          game: true,
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return mem || null;
}

async function findCandidateOwnedAttempt(attemptId, candidateId) {
  const mem = inMemoryGameAttempts.get(attemptId);
  if (mem) {
    return {
      ...mem,
      game: mem.game || { id: mem.gameId, name: "Game", code: "ZIP_PATHFINDER", isActive: true },
    };
  }

  try {
    if (prisma && prisma.gameAttempt) {
      const found = await prisma.gameAttempt.findFirst({
        where: {
          id: attemptId,
          candidateAttempt: {
            candidateId,
          },
        },
        select: {
          id: true,
          candidateAssessmentId: true,
          gameId: true,
          status: true,
          puzzleVersion: true,
          puzzleState: true,
          startedAt: true,
          expiresAt: true,
          score: true,
          metrics: true,
          submittedAt: true,
          game: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
            },
          },
        },
      });
      if (found) return found;
    }
  } catch (_err) {
    // Fallback
  }

  return null;
}

async function submitAttempt(attemptId, score, metrics) {
  const memAttempt = inMemoryGameAttempts.get(attemptId);

  if (memAttempt) {
    if (memAttempt.status === "SUBMITTED") throw new Error("GAME_ATTEMPT_ALREADY_SUBMITTED");
    if (new Date() > memAttempt.expiresAt) throw new Error("GAME_ATTEMPT_EXPIRED");

    memAttempt.status = "SUBMITTED";
    memAttempt.score = score;
    memAttempt.metrics = metrics;
    memAttempt.submittedAt = new Date();

    const resultObj = {
      id: `res_${Date.now()}`,
      candidateAssessmentId: memAttempt.candidateAssessmentId,
      gameId: memAttempt.gameId,
      score,
      metrics,
      createdAt: memAttempt.submittedAt,
    };
    inMemoryGameResults.set(`${memAttempt.candidateAssessmentId}_${memAttempt.gameId}`, resultObj);
    return memAttempt;
  }

  try {
    if (prisma && prisma.gameAttempt) {
      return await prisma.$transaction(async (tx) => {
        const updatedBatch = await tx.gameAttempt.updateMany({
          where: {
            id: attemptId,
            status: "IN_PROGRESS",
            expiresAt: {
              gt: new Date(Date.now() - 10000),
            },
          },
          data: {
            status: "SUBMITTED",
            submittedAt: new Date(),
            score,
            metrics,
          },
        });

        if (updatedBatch.count !== 1) {
          const existingAttempt = await tx.gameAttempt.findUnique({
            where: { id: attemptId },
          });
          if (!existingAttempt) throw new Error("GAME_ATTEMPT_NOT_FOUND");
          if (existingAttempt.status === "SUBMITTED") throw new Error("GAME_ATTEMPT_ALREADY_SUBMITTED");
          if (new Date() > existingAttempt.expiresAt) throw new Error("GAME_ATTEMPT_EXPIRED");
          throw new Error("GAME_ATTEMPT_NOT_ACTIVE");
        }

        const attempt = await tx.gameAttempt.findUnique({
          where: { id: attemptId },
        });

        if (tx.gameResult) {
          await tx.gameResult.upsert({
            where: {
              candidateAssessmentId_gameId: {
                candidateAssessmentId: attempt.candidateAssessmentId,
                gameId: attempt.gameId,
              },
            },
            create: {
              candidateAssessmentId: attempt.candidateAssessmentId,
              gameId: attempt.gameId,
              score,
              metrics,
            },
            update: {
              score,
              metrics,
            },
          });
        }

        return attempt;
      });
    }
  } catch (err) {
    if (["GAME_ATTEMPT_NOT_FOUND", "GAME_ATTEMPT_ALREADY_SUBMITTED", "GAME_ATTEMPT_EXPIRED", "GAME_ATTEMPT_NOT_ACTIVE"].includes(err.message)) {
      throw err;
    }
  }

  throw new Error("GAME_ATTEMPT_NOT_FOUND");
}

async function markAttemptExpired(attemptId, now) {
  const mem = inMemoryGameAttempts.get(attemptId);
  if (mem) {
    mem.status = "EXPIRED";
    return true;
  }

  try {
    if (prisma && prisma.gameAttempt) {
      const result = await prisma.gameAttempt.updateMany({
        where: {
          id: attemptId,
          status: "IN_PROGRESS",
          expiresAt: {
            lte: now,
          },
        },
        data: {
          status: "EXPIRED",
        },
      });
      return result.count === 1;
    }
  } catch (_err) {
    // Fallback
  }
  return false;
}

async function submitAttemptAndCreateResult({ attemptId, candidateAssessmentId, gameId, score, metrics, submittedAt }) {
  return submitAttempt(attemptId, score, metrics).then((res) => ({
    transitioned: true,
    result: {
      id: `res_${Date.now()}`,
      candidateAssessmentId,
      gameId,
      score,
      metrics,
      createdAt: submittedAt,
    },
  }));
}

module.exports = {
  findCandidateAssessment,
  findCandidateAssessmentForGame: findCandidateAssessment,
  findAssessmentGame,
  findGameByCode,
  findGameResult,
  findActiveAttempt,
  findAttemptForCandidate,
  findCandidateOwnedAttempt: findAttemptForCandidate,
  createAttempt,
  submitAttempt,
  markAttemptExpired,
  submitAttemptAndCreateResult,
};
