"use strict";

const { prisma } = require("../../config/prisma");

async function findAllGames() {
  if (!prisma.game) {
    return null;
  }
  return prisma.game.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: [
      {
        name: "asc",
      },
    ],
  });
}

async function findGameById(gameId) {
  if (!prisma.game) {
    return null;
  }
  return prisma.game.findFirst({
    where: {
      OR: [{ id: gameId }, { code: gameId }],
      deletedAt: null,
    },
  });
}

async function findGameByCode(code) {
  if (!prisma.game) {
    return null;
  }
  return prisma.game.findFirst({
    where: {
      code,
      deletedAt: null,
    },
  });
}

async function updateGameStatus(gameId, isActive, tx = prisma) {
  if (!tx.game) {
    return null;
  }

  const existing = await findGameById(gameId);
  const targetId = existing?.id || gameId;

  return tx.game.update({
    where: {
      id: targetId,
    },
    data: {
      isActive,
    },
  });
}

async function countAssessmentsUsingGame(gameId) {
  if (!prisma.assessmentGame) {
    return 0;
  }
  return prisma.assessmentGame.count({
    where: {
      gameId,
    },
  });
}

module.exports = {
  findAllGames,
  findGameById,
  findGameByCode,
  updateGameStatus,
  countAssessmentsUsingGame,
};
