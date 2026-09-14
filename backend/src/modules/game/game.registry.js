"use strict";

const { validateGameEngine } = require("./game.engine.validator");
const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { GAME_SLUGS, GAMES_METADATA } = require("./game.constants");

// Engines
const zipPathfinderEngine = require("./game.zip-pathfinder.engine");
const tangoEngine = require("./game.tango.engine");
const miniSudokuEngine = require("./game.mini-sudoku.engine");
const mahjongTileMatchEngine = require("./game.mahjong-tile-match.engine");

const GAME_CODES = Object.freeze({
  ZIP_PATHFINDER: "ZIP_PATHFINDER",
  TANGO: "TANGO",
  MINI_SUDOKU: "MINI_SUDOKU",
  MAHJONG_TILE_MATCH: "MAHJONG_TILE_MATCH",
});

const GAME_REGISTRY = new Map();

function registerGame(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Game definition is required");
  }

  const {
    slug,
    code,
    engine,
    version = GAME_ENGINE_CONSTANTS.VERSION,
  } = definition;

  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new TypeError("Game slug is required");
  }

  if (typeof code !== "string" || code.trim().length === 0) {
    throw new TypeError("Game code is required");
  }

  validateGameEngine(engine);

  if (!Number.isInteger(version) || version <= 0) {
    throw new TypeError("Game version must be a positive integer");
  }

  const normalizedSlug = slug.trim().toLowerCase();

  if (GAME_REGISTRY.has(normalizedSlug)) {
    throw new Error(`Duplicate game registry slug: ${normalizedSlug}`);
  }

  GAME_REGISTRY.set(
    normalizedSlug,
    Object.freeze({
      slug: normalizedSlug,
      code: code.trim(),
      version,
      engine,
    })
  );
}

registerGame({
  slug: "zip-pathfinder",
  code: "ZIP_PATHFINDER",
  engine: zipPathfinderEngine,
});

registerGame({
  slug: "tango",
  code: "TANGO",
  engine: tangoEngine,
});

registerGame({
  slug: "mini-sudoku",
  code: "MINI_SUDOKU",
  engine: miniSudokuEngine,
});

registerGame({
  slug: "mahjong-tile-match",
  code: "MAHJONG_TILE_MATCH",
  engine: mahjongTileMatchEngine,
});

function getGameDefinition(slug) {
  if (typeof slug !== "string") {
    return null;
  }

  return GAME_REGISTRY.get(slug.trim().toLowerCase()) || null;
}

function getGameEngine(slug) {
  const definition = getGameDefinition(slug);
  return definition ? definition.engine : null;
}

function getGameCode(slug) {
  const definition = getGameDefinition(slug);
  return definition ? definition.code : null;
}

function getRegisteredGames() {
  return Array.from(GAME_REGISTRY.values()).map(
    ({ slug, code, version }) => ({
      slug,
      code,
      version,
    })
  );
}

// Backward compatibility helpers
function getGameMetadataByCode(code) {
  if (!code) return null;
  const norm = String(code).trim().toLowerCase();
  for (const def of GAME_REGISTRY.values()) {
    if (def.code.toLowerCase() === norm || def.slug === norm) {
      return (
        GAMES_METADATA.find((g) => (g.code || g.id).toLowerCase() === norm) || {
          code: def.code,
          slug: def.slug,
        }
      );
    }
  }
  return GAMES_METADATA.find((g) => (g.code || g.id).toLowerCase() === norm) || null;
}

function getGameMetadataBySlug(slug) {
  if (!slug) return null;
  const normalizedSlug = String(slug).trim().toLowerCase();
  const def = getGameDefinition(normalizedSlug);
  if (def) {
    const meta = GAMES_METADATA.find(
      (g) =>
        g.slug.toLowerCase() === normalizedSlug ||
        (g.code && g.code.toLowerCase() === def.code.toLowerCase())
    );
    if (meta) return meta;
    return { id: def.code, code: def.code, slug: def.slug };
  }
  return (
    GAMES_METADATA.find(
      (g) =>
        g.slug.toLowerCase() === normalizedSlug ||
        g.id.toLowerCase() === normalizedSlug ||
        (g.code && g.code.toLowerCase() === normalizedSlug)
    ) || null
  );
}

function getAllGameMetadata() {
  return [...GAMES_METADATA];
}

module.exports = {
  registerGame,
  getGameDefinition,
  getGameEngine,
  getGameCode,
  getRegisteredGames,

  // Existing exports preserved for backwards compatibility
  GAME_CODES,
  GAME_SLUGS,
  GAMES_METADATA,
  getGameMetadataByCode,
  getGameMetadataBySlug,
  getAllGameMetadata,
};
