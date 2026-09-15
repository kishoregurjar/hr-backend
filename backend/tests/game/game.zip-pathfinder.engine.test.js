"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const zipEngine = require("../../src/modules/game/game.zip-pathfinder.engine");

test.describe("ZIP Pathfinder Game Engine", () => {
  test("generates valid ZIP Pathfinder puzzle", () => {
    const result = zipEngine.generatePuzzle({
      seed: "zip-test-seed-1",
      version: 1,
    });

    assert.equal(result.version, 1);
    assert.equal(result.puzzle.size, 8);
    assert.ok(result.puzzle.numbers);
    assert.ok(Array.isArray(result.solution));
    assert.equal(result.solution.length, 64);
  });

  test("accepts valid Hamiltonian path solution", () => {
    const result = zipEngine.generatePuzzle({
      seed: "zip-test-seed-2",
      version: 1,
    });

    const verification = zipEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: result.solution,
    });

    assert.equal(verification.valid, true);
    assert.equal(verification.reason, null);
  });

  test("rejects path with incorrect length", () => {
    const result = zipEngine.generatePuzzle({
      seed: "zip-test-seed-3",
      version: 1,
    });

    const shortPath = result.solution.slice(0, 30);

    const verification = zipEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: shortPath,
    });

    assert.equal(verification.valid, false);
  });

  test("calculates score correctly for valid completion", () => {
    const result = zipEngine.calculateScore({
      verification: { valid: true },
      startedAt: "2026-09-15T09:00:00.000Z",
      submittedAt: "2026-09-15T09:01:30.000Z",
    });

    assert.equal(result.score, 100);
    assert.equal(result.metrics.completed, true);
    assert.equal(result.metrics.elapsedMs, 90000);
  });
});
