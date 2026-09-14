"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { generateZip, verifyZip } = require("./engines/zipEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

function generatePuzzle({ seed = "default-seed", version = GAME_ENGINE_CONSTANTS.VERSION } = {}) {
  const generated = generateZip();
  const puzzleData = {
    puzzle: {
      type: generated.type,
      size: generated.size,
      numbers: generated.numbers,
      targetNumber: generated.targetNumber,
      walls: generated.walls,
    },
    solution: generated.solutionPath,
    seed: String(seed),
    version,
  };
  return validateGeneratedPuzzle(puzzleData);
}

function verifySolution({ puzzle, solution, candidateSolution } = {}) {
  const solToTest = candidateSolution || [];
  const result = verifyZip(solToTest, puzzle || {});
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
