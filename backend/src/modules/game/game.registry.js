"use strict";

const zipPathfinderEngine = require("./game.zip-pathfinder.engine");
const tangoEngine = require("./game.tango.engine");
const miniSudokuEngine = require("./game.mini-sudoku.engine");
const mahjongTileMatchEngine = require("./game.mahjong-tile-match.engine");

const { validateGameDefinition } = require("./game.engine.validator");
const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { GAME_SLUGS, GAMES_METADATA } = require("./game.constants");

const GAME_CODES = Object.freeze({
  ZIP_PATHFINDER: "ZIP_PATHFINDER",
  TANGO: "TANGO",
  MINI_SUDOKU: "MINI_SUDOKU",
  MAHJONG_TILE_MATCH: "MAHJONG_TILE_MATCH",
});

const RAW_GAME_DEFINITIONS = [
  {
    slug: "zip-pathfinder",
    code: "ZIP_PATHFINDER",
    version: zipPathfinderEngine.version || 1,
    engine: zipPathfinderEngine,
  },
  {
    slug: "tango",
    code: "TANGO",
    version: tangoEngine.version || 1,
    engine: tangoEngine,
  },
  {
    slug: "mini-sudoku",
    code: "MINI_SUDOKU",
    version: miniSudokuEngine.version || 1,
    engine: miniSudokuEngine,
  },
  {
    slug: "mahjong-tile-match",
    code: "MAHJONG_TILE_MATCH",
    version: mahjongTileMatchEngine.version || 1,
    engine: mahjongTileMatchEngine,
  },
];

function normalizeIdentifier(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function buildRegistry(definitions) {
  const bySlug = new Map();
  const byCode = new Map();

  for (const definition of definitions) {
    validateGameDefinition(definition);

    const slug = normalizeIdentifier(definition.slug);
    const code = normalizeIdentifier(definition.code);

    if (bySlug.has(slug)) {
      throw new Error(GAME_ENGINE_CONSTANTS.ERROR_CODES.DUPLICATE_GAME_SLUG);
    }

    if (byCode.has(code)) {
      throw new Error(GAME_ENGINE_CONSTANTS.ERROR_CODES.DUPLICATE_GAME_CODE);
    }

    const frozenDefinition = Object.freeze({
      slug: definition.slug,
      code: definition.code,
      version: definition.version,
      engine: definition.engine,
    });

    bySlug.set(slug, frozenDefinition);
    byCode.set(code, frozenDefinition);
  }

  return Object.freeze({
    bySlug,
    byCode,
  });
}

const REGISTRY = buildRegistry(RAW_GAME_DEFINITIONS);

function getGameDefinition(identifier) {
  const normalized = normalizeIdentifier(identifier);

  if (!normalized) {
    return null;
  }

  return (
    REGISTRY.bySlug.get(normalized) ||
    REGISTRY.byCode.get(normalized) ||
    null
  );
}

function getGameEngine(identifier) {
  const definition = getGameDefinition(identifier);
  return definition ? definition.engine : null;
}

function getGameCode(identifier) {
  const definition = getGameDefinition(identifier);
  return definition ? definition.code : null;
}

function getGameSlug(identifier) {
  const definition = getGameDefinition(identifier);
  return definition ? definition.slug : null;
}

function getRegisteredGames() {
  return RAW_GAME_DEFINITIONS.map(({ slug, code, version }) => ({
    slug,
    code,
    version,
  }));
}

function assertGameRegistered(identifier) {
  const definition = getGameDefinition(identifier);

  if (!definition) {
    throw new Error(GAME_ENGINE_CONSTANTS.ERROR_CODES.GAME_NOT_REGISTERED);
  }

  return definition;
}

function registerGame(definition) {
  validateGameDefinition(definition);
  const slug = normalizeIdentifier(definition.slug);
  const code = normalizeIdentifier(definition.code);

  if (REGISTRY.bySlug.has(slug)) {
    throw new Error(GAME_ENGINE_CONSTANTS.ERROR_CODES.DUPLICATE_GAME_SLUG);
  }

  if (REGISTRY.byCode.has(code)) {
    throw new Error(GAME_ENGINE_CONSTANTS.ERROR_CODES.DUPLICATE_GAME_CODE);
  }
}

// Backward compatibility helpers
function getGameMetadataByCode(code) {
  if (!code) return null;
  const norm = normalizeIdentifier(code);
  const def = getGameDefinition(norm);
  if (def) {
    const meta = GAMES_METADATA.find(
      (g) => (g.code || g.id).toLowerCase() === norm
    );
    if (meta) return meta;
    return { id: def.code, code: def.code, slug: def.slug };
  }
  return (
    GAMES_METADATA.find((g) => (g.code || g.id).toLowerCase() === norm) || null
  );
}

function getGameMetadataBySlug(slug) {
  if (!slug) return null;
  const norm = normalizeIdentifier(slug);
  const def = getGameDefinition(norm);
  if (def) {
    const meta = GAMES_METADATA.find(
      (g) =>
        g.slug.toLowerCase() === norm ||
        (g.code && g.code.toLowerCase() === def.code.toLowerCase())
    );
    if (meta) return meta;
    return { id: def.code, code: def.code, slug: def.slug };
  }
  return (
    GAMES_METADATA.find(
      (g) =>
        g.slug.toLowerCase() === norm ||
        g.id.toLowerCase() === norm ||
        (g.code && g.code.toLowerCase() === norm)
    ) || null
  );
}

function getAllGameMetadata() {
  return [...GAMES_METADATA];
}

module.exports = Object.freeze({
  getGameDefinition,
  getGameEngine,
  getGameCode,
  getGameSlug,
  getRegisteredGames,
  assertGameRegistered,
  registerGame,

  // Backwards compatibility exports
  GAME_CODES,
  GAME_SLUGS,
  GAMES_METADATA,
  getGameMetadataByCode,
  getGameMetadataBySlug,
  getAllGameMetadata,
});
