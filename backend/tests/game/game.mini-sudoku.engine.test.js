"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const miniSudokuEngine = require("../../src/modules/game/game.mini-sudoku.engine");

test.describe("Mini Sudoku Game Engine", () => {
  test("should generate a valid 6x6 puzzle", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "test-seed-001",
      version: 1,
    });

    assert.equal(result.version, 1);
    assert.equal(result.seed, "test-seed-001");

    assert.equal(result.puzzle.size, 6);
    assert.equal(result.puzzle.boxRows, 2);
    assert.equal(result.puzzle.boxCols, 3);

    assert.equal(result.puzzle.board.length, 6);
    assert.equal(result.solution.length, 6);

    for (const row of result.puzzle.board) {
      assert.equal(row.length, 6);
    }

    for (const row of result.solution) {
      assert.equal(row.length, 6);
    }
  });

  test("should generate deterministic puzzle for same seed", () => {
    const first = miniSudokuEngine.generatePuzzle({
      seed: "deterministic-seed",
      version: 1,
    });

    const second = miniSudokuEngine.generatePuzzle({
      seed: "deterministic-seed",
      version: 1,
    });

    assert.deepEqual(first.puzzle, second.puzzle);
    assert.deepEqual(first.solution, second.solution);
  });

  test("should generate different puzzle for different seeds", () => {
    const first = miniSudokuEngine.generatePuzzle({
      seed: "seed-a",
      version: 1,
    });

    const second = miniSudokuEngine.generatePuzzle({
      seed: "seed-b",
      version: 1,
    });

    assert.notDeepEqual(first.puzzle, second.puzzle);
  });

  test("should preserve all given cells in solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "given-cell-test",
      version: 1,
    });

    const { board, givens } = result.puzzle;

    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        if (givens[row][col] !== 0) {
          assert.equal(board[row][col], givens[row][col]);
          assert.equal(result.solution[row][col], givens[row][col]);
        }
      }
    }
  });

  test("should accept the exact server solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "correct-solution-test",
      version: 1,
    });

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: result.solution,
    });

    assert.equal(verification.correct, true);
    assert.equal(verification.reason, "CORRECT");
  });

  test("should reject incorrect solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "incorrect-solution-test",
      version: 1,
    });

    const candidate = result.solution.map((row) => [...row]);

    // Swap two values in a row
    [candidate[0][0], candidate[0][1]] = [candidate[0][1], candidate[0][0]];

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    assert.equal(verification.correct, false);
  });

  test("should reject incomplete solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "incomplete-solution-test",
      version: 1,
    });

    const candidate = result.solution.map((row) => [...row]);

    candidate[0][0] = 0;

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    assert.equal(verification.correct, false);
  });

  test("should reject modified given cell", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "locked-cell-test",
      version: 1,
    });

    // Create candidate solution based on server solution
    const candidate = result.solution.map((row) => [...row]);

    let modified = false;

    for (let row = 0; row < 6 && !modified; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        if (result.puzzle.givens[row][col] !== 0) {
          const original = candidate[row][col];

          candidate[row][col] = original === 6 ? 1 : original + 1;

          modified = true;
          break;
        }
      }
    }

    assert.equal(modified, true);

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    assert.equal(verification.correct, false);
  });

  test("should reject malformed candidate board", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "malformed-board-test",
      version: 1,
    });

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: [[1, 2, 3]],
    });

    assert.equal(verification.correct, false);
    assert.equal(verification.reason, "INVALID_CANDIDATE_SOLUTION");
  });

  test("should return 100 for correct solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "score-success-test",
      version: 1,
    });

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: result.solution,
    });

    const startedAt = new Date("2026-01-01T10:00:00.000Z");
    const submittedAt = new Date("2026-01-01T10:02:30.000Z");

    const score = miniSudokuEngine.calculateScore({
      verification,
      startedAt,
      submittedAt,
    });

    assert.equal(score.score, 100);
    assert.equal(score.metrics.completed, true);
    assert.equal(score.metrics.elapsedMs, 150000);
  });

  test("should return 0 for incorrect solution", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "score-failure-test",
      version: 1,
    });

    const candidate = result.solution.map((row) => [...row]);

    candidate[0][0] = candidate[0][0] === 6 ? 1 : candidate[0][0] + 1;

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    const score = miniSudokuEngine.calculateScore({
      verification,
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
      submittedAt: new Date("2026-01-01T10:01:00.000Z"),
    });

    assert.equal(score.score, 0);
    assert.equal(score.metrics.completed, false);
  });

  test("should reject negative elapsed time", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "negative-time-test",
      version: 1,
    });

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: result.solution,
    });

    assert.throws(
      () =>
        miniSudokuEngine.calculateScore({
          verification,
          startedAt: new Date("2026-01-01T10:01:00.000Z"),
          submittedAt: new Date("2026-01-01T10:00:00.000Z"),
        }),
      /Invalid game elapsed time/
    );
  });

  test("should reject duplicate value in a row", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "duplicate-row-test",
      version: 1,
    });

    const candidate = result.solution.map((row) => [...row]);
    candidate[0][1] = candidate[0][0];

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    assert.equal(verification.correct, false);
    assert.equal(verification.reason, "INVALID_SUDOKU_SOLUTION");
  });

  test("should reject duplicate value in a column", () => {
    const result = miniSudokuEngine.generatePuzzle({
      seed: "duplicate-column-test",
      version: 1,
    });

    const candidate = result.solution.map((row) => [...row]);
    candidate[1][0] = candidate[0][0];

    const verification = miniSudokuEngine.verifySolution({
      puzzle: result.puzzle,
      solution: result.solution,
      candidateSolution: candidate,
    });

    assert.equal(verification.correct, false);
    assert.equal(verification.reason, "INVALID_SUDOKU_SOLUTION");
  });
});
