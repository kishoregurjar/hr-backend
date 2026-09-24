"use strict";

const { prisma } = require("../../config/prisma");

async function findAllGames() {
  try {
    if (!prisma.game) return null;
    return await prisma.game.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [
        {
          name: "asc",
        },
      ],
    });
  } catch (_err) {
    return null;
  }
}

async function findGameById(gameId) {
  try {
    if (!prisma.game) return null;
    return await prisma.game.findFirst({
      where: {
        OR: [{ id: gameId }, { code: gameId }],
        deletedAt: null,
      },
    });
  } catch (_err) {
    return null;
  }
}

async function findGameByCode(code) {
  try {
    if (!prisma.game) return null;
    return await prisma.game.findFirst({
      where: {
        code,
        deletedAt: null,
      },
    });
  } catch (_err) {
    return null;
  }
}

async function updateGameStatus(gameId, isActive, metadata = null, tx = prisma) {
  try {
    if (!tx.game) return null;
    const existing = await findGameById(gameId);

    if (existing) {
      return await tx.game.update({
        where: { id: existing.id },
        data: { isActive },
      });
    }

    const code = metadata?.code || gameId;
    const name = metadata?.name || gameId;
    const description = metadata?.description || null;

    return await tx.game.upsert({
      where: { code },
      create: {
        id: metadata?.id || gameId,
        code,
        name,
        description,
        isActive,
      },
      update: {
        isActive,
      },
    });
  } catch (err) {
    console.error("Repository updateGameStatus DB error:", err);
    return null;
  }
}

async function countAssessmentsUsingGame(gameId) {
  try {
    if (!prisma.assessmentGame) return 0;
    return await prisma.assessmentGame.count({
      where: {
        gameId,
      },
    });
  } catch (_err) {
    return 0;
  }
}

module.exports = {
  findAllGames,
  findGameById,
  findGameByCode,
  updateGameStatus,
  countAssessmentsUsingGame,
};
