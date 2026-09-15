"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../../src/modules/game/game.mahjong-tile-match.engine");

test.describe("Mahjong Tile Match Engine", () => {
  test("generates valid easy Mahjong puzzle", () => {
    const result = engine.generatePuzzle({
      difficulty: "easy",
      seed: "test-seed-001",
    });

    assert.equal(result.version, 1);
    assert.equal(result.puzzle.rows, 6);
    assert.equal(result.puzzle.cols, 8);

    assert.equal(result.puzzle.board.length, 6);

    for (const row of result.puzzle.board) {
      assert.equal(row.length, 8);
    }
  });

  test("generation is deterministic for same seed", () => {
    const first = engine.generatePuzzle({
      difficulty: "easy",
      seed: "same-seed",
    });

    const second = engine.generatePuzzle({
      difficulty: "easy",
      seed: "same-seed",
    });

    assert.deepEqual(first.puzzle, second.puzzle);
  });

  test("different seeds generate different boards", () => {
    const first = engine.generatePuzzle({
      difficulty: "easy",
      seed: "seed-a",
    });

    const second = engine.generatePuzzle({
      difficulty: "easy",
      seed: "seed-b",
    });

    assert.notDeepEqual(first.puzzle.board, second.puzzle.board);
  });

  test("easy board contains 48 tiles", () => {
    const result = engine.generatePuzzle({
      difficulty: "easy",
      seed: "tile-count",
    });

    const tiles = result.puzzle.board.flat().filter(Boolean);

    assert.equal(tiles.length, 48);
  });

  test("medium board contains 80 tiles", () => {
    const result = engine.generatePuzzle({
      difficulty: "medium",
      seed: "medium-count",
    });

    const tiles = result.puzzle.board.flat().filter(Boolean);

    assert.equal(tiles.length, 80);
  });

  test("hard board contains 120 tiles", () => {
    const result = engine.generatePuzzle({
      difficulty: "hard",
      seed: "hard-count",
    });

    const tiles = result.puzzle.board.flat().filter(Boolean);

    assert.equal(tiles.length, 120);
  });

  test("every tile design occurs in pairs", () => {
    const result = engine.generatePuzzle({
      difficulty: "easy",
      seed: "pair-check",
    });

    const counts = {};

    for (const tile of result.puzzle.board.flat()) {
      if (tile) {
        counts[tile.designId] = (counts[tile.designId] || 0) + 1;
      }
    }

    for (const count of Object.values(counts)) {
      assert.equal(count % 2, 0);
    }
  });

  test("adjacent identical tiles can match", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          {
            id: "b",
            designId: "dot_1",
            row: 0,
            col: 1,
          },
          null,
          null,
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifyMove({
      puzzle,
      candidateMove: {
        first: { row: 0, col: 0 },
        second: { row: 0, col: 1 },
      },
    });

    assert.equal(result.valid, true);
    assert.equal(result.remainingTiles, 0);
    assert.equal(result.completed, true);
  });

  test("same-row identical tiles match through empty path", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          null,
          null,
          {
            id: "b",
            designId: "dot_1",
            row: 0,
            col: 3,
          },
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifyMove({
      puzzle,
      candidateMove: {
        first: { row: 0, col: 0 },
        second: { row: 0, col: 3 },
      },
    });

    assert.equal(result.valid, true);
  });

  test("blocked same-row path cannot match", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          {
            id: "x",
            designId: "dot_2",
            row: 0,
            col: 1,
          },
          {
            id: "b",
            designId: "dot_1",
            row: 0,
            col: 2,
          },
          null,
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifyMove({
      puzzle,
      candidateMove: {
        first: { row: 0, col: 0 },
        second: { row: 0, col: 2 },
      },
    });

    assert.equal(result.valid, false);
  });

  test("different tiles cannot match", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          {
            id: "b",
            designId: "dot_2",
            row: 0,
            col: 1,
          },
          null,
          null,
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifyMove({
      puzzle,
      candidateMove: {
        first: { row: 0, col: 0 },
        second: { row: 0, col: 1 },
      },
    });

    assert.equal(result.valid, false);
    assert.equal(result.reason, "TILE_MISMATCH");
  });

  test("complete solution is accepted", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          {
            id: "b",
            designId: "dot_1",
            row: 0,
            col: 1,
          },
          null,
          null,
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifySolution({
      puzzle,
      candidateSolution: {
        moves: [
          {
            first: { row: 0, col: 0 },
            second: { row: 0, col: 1 },
          },
        ],
      },
    });

    assert.equal(result.valid, true);
    assert.equal(result.completed, true);
    assert.equal(result.remainingTiles, 0);
  });

  test("incomplete solution is rejected", () => {
    const puzzle = {
      difficulty: "easy",
      board: [
        [
          {
            id: "a",
            designId: "dot_1",
            row: 0,
            col: 0,
          },
          {
            id: "b",
            designId: "dot_1",
            row: 0,
            col: 1,
          },
          null,
          null,
          null,
          null,
        ],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null],
      ],
    };

    const result = engine.verifySolution({
      puzzle,
      candidateSolution: {
        moves: [],
      },
    });

    assert.equal(result.valid, false);
  });

  test("score is server calculated", () => {
    const result = engine.calculateScore({
      verification: {
        valid: true,
        completed: true,
        moves: 10,
      },
      startedAt: "2026-09-15T09:00:00.000Z",
      submittedAt: "2026-09-15T09:01:00.000Z",
    });

    assert.equal(result.score, 100);
    assert.equal(result.metrics.completed, true);
    assert.equal(result.metrics.moves, 10);
    assert.equal(result.metrics.elapsedMs, 60000);
  });

  test("invalid timestamp order is rejected", () => {
    assert.throws(() =>
      engine.calculateScore({
        verification: {
          valid: true,
        },
        startedAt: "2026-09-15T09:02:00.000Z",
        submittedAt: "2026-09-15T09:01:00.000Z",
      })
    );
  });
});
