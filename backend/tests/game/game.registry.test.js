"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const registry = require("../../src/modules/game/game.registry");

test("resolves Mini Sudoku by slug", () => {
  const definition = registry.getGameDefinition("mini-sudoku");

  assert.ok(definition);
  assert.equal(definition.slug, "mini-sudoku");
  assert.equal(definition.code, "MINI_SUDOKU");
});

test("resolves Mini Sudoku case-insensitively", () => {
  const definition = registry.getGameDefinition(" MINI-SUDOKU ");

  assert.ok(definition);
  assert.equal(definition.code, "MINI_SUDOKU");
});

test("resolves Mahjong by slug", () => {
  const definition = registry.getGameDefinition("mahjong-tile-match");

  assert.ok(definition);
  assert.equal(definition.code, "MAHJONG_TILE_MATCH");
});

test("resolves Mahjong by canonical code", () => {
  const definition = registry.getGameDefinition("mahjong_tile_match");

  assert.ok(definition);
  assert.equal(definition.slug, "mahjong-tile-match");
});

test("returns null for unknown game", () => {
  const definition = registry.getGameDefinition("unknown-game");

  assert.equal(definition, null);
});

test("getGameEngine returns engine", () => {
  const engine = registry.getGameEngine("mini-sudoku");

  assert.ok(engine);
  assert.equal(typeof engine.generatePuzzle, "function");
  assert.equal(typeof engine.verifySolution, "function");
  assert.equal(typeof engine.calculateScore, "function");
});

test("getGameCode resolves canonical code", () => {
  assert.equal(registry.getGameCode("mini-sudoku"), "MINI_SUDOKU");
  assert.equal(registry.getGameCode("mahjong-tile-match"), "MAHJONG_TILE_MATCH");
});

test("getGameSlug resolves canonical slug", () => {
  assert.equal(registry.getGameSlug("MINI_SUDOKU"), "mini-sudoku");
  assert.equal(registry.getGameSlug("MAHJONG_TILE_MATCH"), "mahjong-tile-match");
});

test("registered games expose metadata only", () => {
  const games = registry.getRegisteredGames();

  assert.ok(Array.isArray(games));
  assert.ok(games.length >= 2);

  for (const game of games) {
    assert.equal(typeof game.slug, "string");
    assert.equal(typeof game.code, "string");
    assert.equal(typeof game.version, "number");
    assert.equal(
      Object.prototype.hasOwnProperty.call(game, "engine"),
      false
    );
  }
});

test("assertGameRegistered returns definition", () => {
  const definition = registry.assertGameRegistered("MINI_SUDOKU");

  assert.equal(definition.code, "MINI_SUDOKU");
});

test("assertGameRegistered rejects unknown game", () => {
  assert.throws(
    () => registry.assertGameRegistered("does-not-exist"),
    /GAME_NOT_REGISTERED/
  );
});
