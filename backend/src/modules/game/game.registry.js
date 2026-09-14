"use strict";

const { GAME_SLUGS, GAMES_METADATA } = require("./game.constants");

const GAME_CODES = Object.freeze({
  ZIP_PATHFINDER: "ZIP_PATHFINDER",
  TANGO: "TANGO",
  MINI_SUDOKU: "MINI_SUDOKU",
  MAHJONG_TILE_MATCH: "MAHJONG_TILE_MATCH",
});

const GAME_REGISTRY_BY_CODE = new Map(
  GAMES_METADATA.map((game) => [game.code || game.id, game])
);

const GAME_REGISTRY_BY_SLUG = new Map(
  GAMES_METADATA.map((game) => [game.slug, game])
);

function getGameMetadataByCode(code) {
  if (!code) return null;
  return GAME_REGISTRY_BY_CODE.get(code) || null;
}

function getGameMetadataBySlug(slug) {
  if (!slug) return null;
  const normalizedSlug = String(slug).toLowerCase();
  return (
    GAME_REGISTRY_BY_SLUG.get(normalizedSlug) ||
    GAMES_METADATA.find(
      (g) =>
        g.slug.toLowerCase() === normalizedSlug ||
        g.id.toLowerCase() === normalizedSlug ||
        (g.code && g.code.toLowerCase() === normalizedSlug)
    ) ||
    null
  );
}

function getAllGameMetadata() {
  return [...GAMES_METADATA];
}

module.exports = {
  GAME_CODES,
  GAME_SLUGS,
  GAMES_METADATA,
  getGameMetadataByCode,
  getGameMetadataBySlug,
  getAllGameMetadata,
};
