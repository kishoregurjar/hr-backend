"use strict";

const { NotFoundError, ConflictError, BadRequestError } = require("../../common/errors");
const repository = require("./game.super-admin.repository");
const mapper = require("./game.super-admin.mapper");
const {
  getGameMetadataByCode,
  getGameMetadataBySlug,
  getAllGameMetadata,
} = require("./game.registry");
const { GAME_SUPER_ADMIN_CONSTANTS } = require("./game.super-admin.constants");

// In-memory status store for zero-migration DB fallback
const inMemoryGameStatus = new Map();

async function listGames() {
  const dbGames = (await repository.findAllGames()) || [];
  const allMetadata = getAllGameMetadata();

  const dbGameMap = new Map();
  dbGames.forEach((g) => {
    if (g.code) dbGameMap.set(String(g.code).toLowerCase(), g);
    if (g.id) dbGameMap.set(String(g.id).toLowerCase(), g);
  });

  return allMetadata.map((metadata) => {
    const codeKey = String(metadata.code || metadata.slug || "").toLowerCase();
    const idKey = String(metadata.id || "").toLowerCase();
    const dbMatch = dbGameMap.get(codeKey) || dbGameMap.get(idKey);

    const memoryStatus = inMemoryGameStatus.get(metadata.code) ?? inMemoryGameStatus.get(metadata.id) ?? true;

    const gameEntity = dbMatch || {
      id: metadata.id,
      code: metadata.code,
      name: metadata.name,
      description: metadata.description,
      isActive: memoryStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return mapper.mapGame(gameEntity, metadata);
  });
}

async function getGame(gameId) {
  const dbGame = await repository.findGameById(gameId);
  const metadata = getGameMetadataByCode(gameId) || getGameMetadataBySlug(gameId);

  if (!dbGame && !metadata) {
    throw new NotFoundError("Game not found", GAME_SUPER_ADMIN_CONSTANTS.ERROR_CODES.GAME_NOT_FOUND);
  }

  if (dbGame) {
    return mapper.mapGame(dbGame, metadata);
  }

  const memoryStatus = inMemoryGameStatus.get(metadata.code) ?? inMemoryGameStatus.get(metadata.id) ?? true;
  return mapper.mapGame(
    {
      id: metadata.id,
      code: metadata.code,
      name: metadata.name,
      description: metadata.description,
      isActive: memoryStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    metadata
  );
}

async function updateGameStatus(gameId, isActive) {
  const dbGame = await repository.findGameById(gameId);
  const metadata = getGameMetadataByCode(gameId) || getGameMetadataBySlug(gameId);

  if (!dbGame && !metadata) {
    throw new NotFoundError("Game not found", GAME_SUPER_ADMIN_CONSTANTS.ERROR_CODES.GAME_NOT_FOUND);
  }

  const currentIsActive = dbGame
    ? dbGame.isActive
    : (inMemoryGameStatus.get(metadata.code) ?? inMemoryGameStatus.get(metadata.id) ?? true);

  if (currentIsActive === isActive) {
    throw new ConflictError(
      "Game is already in the requested status",
      GAME_SUPER_ADMIN_CONSTANTS.ERROR_CODES.GAME_ALREADY_IN_STATUS
    );
  }

  if (dbGame) {
    const updatedGame = await repository.updateGameStatus(dbGame.id, isActive);
    return mapper.mapGame(updatedGame, metadata);
  }

  // Update in-memory status
  const key = metadata.code || metadata.id;
  inMemoryGameStatus.set(key, isActive);
  inMemoryGameStatus.set(metadata.id, isActive);
  if (metadata.code) inMemoryGameStatus.set(metadata.code, isActive);

  return mapper.mapGame(
    {
      id: metadata.id,
      code: metadata.code,
      name: metadata.name,
      description: metadata.description,
      isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    metadata
  );
}

function getInMemoryGameStatusMap() {
  return inMemoryGameStatus;
}

const { prisma } = require("../../config/prisma");

async function getCompanyGameConfigs(companyId) {
  const games = await listGames();
  if (!companyId) return games;

  const configs = await prisma.companyGameConfig.findMany({
    where: { companyId },
    include: { game: true },
  });

  const configMap = new Map();
  configs.forEach((c) => {
    if (c.gameId) configMap.set(String(c.gameId).toLowerCase(), c);
    if (c.game?.code) configMap.set(String(c.game.code).toLowerCase(), c);
    if (c.game?.id) configMap.set(String(c.game.id).toLowerCase(), c);
  });

  return games.map((game) => {
    const gameIdKey = String(game.id || "").toLowerCase();
    const gameCodeKey = String(game.code || "").toLowerCase();
    const gameSlugKey = String(game.slug || "").toLowerCase();

    const savedConfig =
      configMap.get(gameIdKey) ||
      configMap.get(gameCodeKey) ||
      configMap.get(gameSlugKey);

    const isCompanyActive = savedConfig ? (savedConfig.status === "Active" || savedConfig.status === "ACTIVE") : true;
    const finalIsActive = Boolean(game.isActive) && isCompanyActive;

    return {
      ...game,
      isActive: finalIsActive,
      isCompanyActive,
      companyStatus: savedConfig ? savedConfig.status : "Active",
    };
  });
}

async function updateCompanyGameStatus(companyId, gameId, status) {
  if (!companyId || !gameId) {
    throw new BadRequestError("Company ID and Game ID are required.");
  }

  const normalizedStatus = status === "Active" || status === true ? "Active" : "Inactive";
  
  // Find or create Game in DB
  let dbGame = await prisma.game.findFirst({
    where: { OR: [{ id: gameId }, { code: gameId }] },
  });

  if (!dbGame) {
    const metadata = getGameMetadataByCode(gameId) || getGameMetadataBySlug(gameId);
    if (!metadata) throw new NotFoundError("Game not found");
    
    dbGame = await prisma.game.create({
      data: {
        id: metadata.id,
        code: metadata.code,
        name: metadata.name,
        description: metadata.description,
        isActive: true,
      },
    });
  }

  const updatedConfig = await prisma.companyGameConfig.upsert({
    where: {
      companyId_gameId: {
        companyId,
        gameId: dbGame.id,
      },
    },
    create: {
      companyId,
      gameId: dbGame.id,
      status: normalizedStatus,
    },
    update: {
      status: normalizedStatus,
    },
  });

  return updatedConfig;
}

async function bulkUpdateCompanyGameStatus(companyIds, gameId, status) {
  if (!Array.isArray(companyIds) || companyIds.length === 0 || !gameId) {
    throw new BadRequestError("Valid companyIds array and gameId are required.");
  }

  const normalizedStatus = status === "Active" || status === true ? "Active" : "Inactive";

  // Find or create Game in DB
  let dbGame = await prisma.game.findFirst({
    where: { OR: [{ id: gameId }, { code: gameId }] },
  });

  if (!dbGame) {
    const metadata = getGameMetadataByCode(gameId) || getGameMetadataBySlug(gameId);
    if (!metadata) throw new NotFoundError("Game not found");

    dbGame = await prisma.game.create({
      data: {
        id: metadata.id,
        code: metadata.code,
        name: metadata.name,
        description: metadata.description,
        isActive: true,
      },
    });
  }

  // Execute bulk upsert inside Prisma transaction
  const results = await prisma.$transaction(
    companyIds.map((cId) =>
      prisma.companyGameConfig.upsert({
        where: {
          companyId_gameId: {
            companyId: cId,
            gameId: dbGame.id,
          },
        },
        create: {
          companyId: cId,
          gameId: dbGame.id,
          status: normalizedStatus,
        },
        update: {
          status: normalizedStatus,
        },
      })
    )
  );

  return {
    gameId: dbGame.id,
    companyIds,
    status: normalizedStatus,
    updatedCount: results.length,
  };
}

module.exports = {
  listGames,
  getGame,
  updateGameStatus,
  getInMemoryGameStatusMap,
  getCompanyGameConfigs,
  updateCompanyGameStatus,
  bulkUpdateCompanyGameStatus,
};


