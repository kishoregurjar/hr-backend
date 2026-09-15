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

module.exports = {
  listGames,
  getGame,
  updateGameStatus,
  getInMemoryGameStatusMap,
};
