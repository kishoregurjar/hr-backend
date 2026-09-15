"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const tangoEngine = require("../../src/modules/game/game.tango.engine");

test.describe("Tango Game Engine", () => {
  test("generates valid 6x6 Tango puzzle", () => {
    const result = tangoEngine.generatePuzzle({
      seed: "tango-test-seed-1",
      version: 1,
    });

    assert.equal(result.version, 1);
    assert.equal(result.puzzle.size, 6);
    assert.ok(result.puzzle.initial);
    assert.ok(Array.isArray(result.puzzle.constraints));
  });

  test("accepts valid Tango grid solution", () => {
    const result = tangoEngine.generatePuzzle({
      seed: "tango-test-seed-2",
      version: 1,
    });

    // Convert array solution grid to key-value grid object
    const gridObj = {};
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        gridObj[`${r}-${c}`] = result.solution[r][c];
      }
    }

    const verification = tangoEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: gridObj,
    });

    assert.equal(verification.valid, true);
    assert.equal(verification.reason, null);
  });

  test("rejects grid with 3 consecutive identical symbols", () => {
    const result = tangoEngine.generatePuzzle({
      seed: "tango-test-seed-3",
      version: 1,
    });

    const gridObj = {};
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        gridObj[`${r}-${c}`] = result.solution[r][c];
      }
    }

    // Force 3 consecutive X in row 0
    gridObj["0-0"] = "X";
    gridObj["0-1"] = "X";
    gridObj["0-2"] = "X";

    const verification = tangoEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: gridObj,
    });

    assert.equal(verification.valid, false);
  });

  test("calculates score correctly for valid completion", () => {
    const result = tangoEngine.calculateScore({
      verification: { valid: true },
      startedAt: "2026-09-15T09:00:00.000Z",
      submittedAt: "2026-09-15T09:02:00.000Z",
    });

    assert.equal(result.score, 100);
    assert.equal(result.metrics.completed, true);
    assert.equal(result.metrics.elapsedMs, 120000);
  });
});
