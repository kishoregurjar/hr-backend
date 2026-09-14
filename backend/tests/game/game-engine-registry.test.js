"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGameDefinition,
  getGameEngine,
  getGameCode,
  getRegisteredGames,
  registerGame,
} = require("../../src/modules/game/game.registry");

const {
  createGameSeed,
  createDeterministicRandom,
  randomInt,
  shuffle,
} = require("../../src/modules/game/game.engine.crypto");

const {
  validateGeneratedPuzzle,
  validateGameEngine,
} = require("../../src/modules/game/game.engine.validator");

const { GAME_ENGINE_CONSTANTS } = require("../../src/modules/game/game.engine.constants");

test("Game Engine Registry - Resolves canonical games by slug", () => {
  const zipDef = getGameDefinition("zip-pathfinder");
  assert.ok(zipDef);
  assert.equal(zipDef.code, "ZIP_PATHFINDER");
  assert.equal(typeof zipDef.engine.generatePuzzle, "function");

  const tangoCode = getGameCode("tango");
  assert.equal(tangoCode, "TANGO");

  const sudokuEngine = getGameEngine("mini-sudoku");
  assert.ok(sudokuEngine);
  assert.equal(typeof sudokuEngine.verifySolution, "function");

  const registered = getRegisteredGames();
  assert.equal(registered.length, 4);
});

test("Game Engine Registry - Rejects duplicate game registration", () => {
  assert.throws(
    () => {
      registerGame({
        slug: "zip-pathfinder",
        code: "ZIP_PATHFINDER_DUP",
        engine: {
          generatePuzzle: () => {},
          verifySolution: () => {},
          calculateScore: () => {},
        },
      });
    },
    { message: /Duplicate game registry slug: zip-pathfinder/ }
  );
});

test("Game Crypto - Generates cryptographically secure seeds & deterministic randoms", () => {
  const seed1 = createGameSeed();
  const seed2 = createGameSeed();
  assert.equal(seed1.length, 64);
  assert.notEqual(seed1, seed2);

  const rng1 = createDeterministicRandom("fixed-test-seed");
  const rng2 = createDeterministicRandom("fixed-test-seed");

  const val1a = rng1();
  const val1b = rng1();
  const val2a = rng2();
  const val2b = rng2();

  assert.equal(val1a, val2a);
  assert.equal(val1b, val2b);

  const arr = [1, 2, 3, 4, 5];
  const shuffled = shuffle(arr, createDeterministicRandom("fixed-test-seed"));
  assert.equal(shuffled.length, 5);
  assert.notDeepEqual(shuffled, arr);
});

test("Game Engine Validator - Validates puzzle payload and engine structure", () => {
  const mockPuzzle = {
    puzzle: { size: 6 },
    solution: { path: [] },
    seed: "sample-seed",
    version: 1,
  };

  const validated = validateGeneratedPuzzle(mockPuzzle);
  assert.deepEqual(validated, mockPuzzle);

  const mockEngine = {
    generatePuzzle: () => {},
    verifySolution: () => {},
    calculateScore: () => {},
  };

  assert.doesNotThrow(() => validateGameEngine(mockEngine));
});

test("Game Engines - Contract implementation generates puzzles & verifies solutions", () => {
  const slugs = ["zip-pathfinder", "tango", "mini-sudoku", "mahjong-tile-match"];

  for (const slug of slugs) {
    const engine = getGameEngine(slug);
    assert.ok(engine, `Engine for ${slug} should exist`);
    assert.equal(engine.version, GAME_ENGINE_CONSTANTS.VERSION);

    const generated = engine.generatePuzzle({ seed: "test-seed-123", version: 1 });
    assert.ok(generated.puzzle);
    assert.ok(generated.solution);
    assert.equal(generated.seed, "test-seed-123");

    const verification = engine.verifySolution({
      puzzle: generated.puzzle,
      solution: generated.solution,
      candidateSolution: null,
    });
    assert.ok(typeof verification.valid === "boolean");

    const score = engine.calculateScore({
      verification: { valid: true, score: 100 },
      startedAt: new Date(),
      submittedAt: new Date(),
    });
    assert.equal(typeof score, "number");
    assert.ok(score >= 0 && score <= 100);
  }
});
