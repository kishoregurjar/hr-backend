"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { createBoard, verifyMahjong } = require("./engines/mahjongEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

function generatePuzzle({ seed = "default-seed", version = GAME_ENGINE_CONSTANTS.VERSION } = {}) {
  const board = createBoard();
  const puzzleData = {
    puzzle: {
      type: "mahjong",
      board,
    },
    solution: { board },
    seed: String(seed),
    version,
  };
  return validateGeneratedPuzzle(puzzleData);
}

function verifySolution({ puzzle, solution, candidateSolution } = {}) {
  const solToTest = candidateSolution || {};
  const result = verifyMahjong(solToTest);
  return {
    valid: result.valid,
    error: result.error || null,
    score: result.score || (result.valid ? 100 : 0),
  };
}

function calculateScore({ verification, startedAt, submittedAt } = {}) {
  if (!verification || !verification.valid) return 0;
  return verification.score ?? 100;
}

module.exports = Object.freeze({
  version: GAME_ENGINE_CONSTANTS.VERSION,
  generatePuzzle,
  verifySolution,
  calculateScore,
});
