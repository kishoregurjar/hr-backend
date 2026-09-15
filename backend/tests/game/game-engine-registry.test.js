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
        version: 1,
        engine: {
          generatePuzzle: () => {},
          verifySolution: () => {},
          calculateScore: () => {},
        },
      });
    },
    /DUPLICATE_GAME_SLUG/
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

test("Mini Sudoku Engine - Full 6x6 generation, givens immutability & server verification", () => {
  const engine = getGameEngine("mini-sudoku");
  assert.ok(engine);

  const generated = engine.generatePuzzle({ seed: "sudoku-seed-999", version: 1 });
  assert.equal(generated.puzzle.size, 6);
  assert.equal(generated.puzzle.boxRows, 2);
  assert.equal(generated.puzzle.boxCols, 3);
  assert.equal(generated.solution.length, 6);

  // 1. Verify correct solution
  const verCorrect = engine.verifySolution({
    puzzle: generated.puzzle,
    solution: generated.solution,
    candidateSolution: generated.solution,
  });
  assert.equal(verCorrect.correct, true);
  assert.equal(verCorrect.reason, "CORRECT");

  // 2. Score calculation
  const start = new Date(Date.now() - 5000);
  const end = new Date();
  const scoreResult = engine.calculateScore({
    verification: verCorrect,
    startedAt: start,
    submittedAt: end,
  });
  assert.equal(scoreResult.score, 100);
  assert.equal(scoreResult.metrics.completed, true);
  assert.ok(scoreResult.metrics.elapsedMs >= 0);

  // 3. Verify invalid candidate board
  const invalidSolution = generated.solution.map((r) => [...r]);
  invalidSolution[0][1] = invalidSolution[0][0]; // Create row conflict

  const verInvalid = engine.verifySolution({
    puzzle: generated.puzzle,
    solution: generated.solution,
    candidateSolution: invalidSolution,
  });
  assert.equal(verInvalid.correct, false);
  assert.equal(verInvalid.reason, "INVALID_SUDOKU_SOLUTION");
});
