"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGameDefinition,
  getGameEngine,
  getGameCode,
  getRegisteredGames,
} = require("../../src/modules/game/game.registry");

test.describe("Game Registry", () => {
  test("should resolve Mini Sudoku by slug", () => {
    const definition = getGameDefinition("mini-sudoku");

    assert.ok(definition);
    assert.equal(definition.slug, "mini-sudoku");
    assert.equal(definition.code, "MINI_SUDOKU");
    assert.equal(definition.version, 1);
  });

  test("should normalize slug case and whitespace", () => {
    const definition = getGameDefinition("  MINI-SUDOKU  ");

    assert.ok(definition);
    assert.equal(definition.code, "MINI_SUDOKU");
  });

  test("should resolve engine by slug", () => {
    const engine = getGameEngine("mini-sudoku");

    assert.ok(engine);
    assert.equal(typeof engine.generatePuzzle, "function");
    assert.equal(typeof engine.verifySolution, "function");
    assert.equal(typeof engine.calculateScore, "function");
  });

  test("should resolve canonical game code", () => {
    assert.equal(getGameCode("mini-sudoku"), "MINI_SUDOKU");
  });

  test("should return null for unknown game", () => {
    assert.equal(getGameDefinition("unknown-game"), null);
    assert.equal(getGameEngine("unknown-game"), null);
    assert.equal(getGameCode("unknown-game"), null);
  });

  test("should expose registered games without engine internals", () => {
    const games = getRegisteredGames();

    assert.ok(Array.isArray(games));

    const sudoku = games.find((game) => game.slug === "mini-sudoku");

    assert.ok(sudoku);
    assert.equal(sudoku.code, "MINI_SUDOKU");
    assert.equal(sudoku.version, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(sudoku, "engine"),
      false
    );
  });
});
