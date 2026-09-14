"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { generateSudoku, verifySudoku } = require("./engines/sudokuEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

function generatePuzzle({ seed = "default-seed", version = GAME_ENGINE_CONSTANTS.VERSION } = {}) {
  const generated = generateSudoku();
  const puzzleData = {
    puzzle: {
      type: generated.type,
      size: generated.size,
      boxRows: generated.boxRows,
      boxCols: generated.boxCols,
      puzzle: generated.puzzle,
      initialBoard: generated.initialBoard,
      difficulty: generated.difficulty,
    },
    solution: generated.solution,
    seed: String(seed),
    version,
  };
  return validateGeneratedPuzzle(puzzleData);
}

function verifySolution({ puzzle, solution, candidateSolution } = {}) {
  const solToTest = candidateSolution || [];
  const result = verifySudoku(solToTest, puzzle || {});
  return {
    valid: result.valid,
    error: result.error || null,
    score: result.valid ? 100 : 0,
  };
}

function calculateScore({ verification, startedAt, submittedAt } = {}) {
  if (!verification || !verification.valid) return 0;
  return 100;
}

module.exports = Object.freeze({
  version: GAME_ENGINE_CONSTANTS.VERSION,
  generatePuzzle,
  verifySolution,
  calculateScore,
});
