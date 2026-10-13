"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { createGameSeed } = require("./game.engine.crypto");
const { generateNQueens, verifyNQueens } = require("./engines/nQueensEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

const VERSION = 1;

function generatePuzzle({ seed = createGameSeed(), version = VERSION, difficulty = "medium" } = {}) {
  const generated = generateNQueens({ seed, difficulty });

  const puzzleData = {
    puzzle: {
      type: generated.type || "n-queens",
      size: generated.size || 8,
      targetQueens: generated.targetQueens || 8,
      regions: generated.regions || [],
      initial: [],
      difficulty: generated.difficulty || difficulty,
      rules: generated.rules,
    },
    solution: generated.solution,
    seed: String(seed),
    version,
  };

  return validateGeneratedPuzzle(puzzleData);
}

function verifySolution({ puzzle, solution, candidateSolution }) {
  if (!puzzle || typeof puzzle !== "object") {
    return {
      valid: false,
      reason: "INVALID_PUZZLE",
      error: "Puzzle payload is required",
    };
  }

  let candidateQueens = candidateSolution;
  if (candidateSolution && typeof candidateSolution === "object" && Array.isArray(candidateSolution.queens)) {
    candidateQueens = candidateSolution.queens;
  }

  if (!candidateQueens) {
    return {
      valid: false,
      reason: "INVALID_CANDIDATE_SOLUTION",
      error: "Candidate solution must contain queen placements",
    };
  }

  const result = verifyNQueens(candidateQueens, puzzle);

  return {
    valid: Boolean(result.valid),
    reason: result.valid ? null : (result.error || "CONSTRAINT_VIOLATION"),
    error: result.error || null,
  };
}

function calculateScore({ verification, startedAt, submittedAt }) {
  if (!verification || typeof verification.valid !== "boolean") {
    throw new TypeError("Invalid game verification result");
  }

  const start = new Date(startedAt).getTime();
  const submitted = new Date(submittedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(submitted) || submitted < start) {
    throw new Error("Invalid game elapsed time");
  }

  const elapsedMs = submitted - start;
  // If valid, give base score 70 + speed bonus up to 30
  let score = 0;
  if (verification.valid) {
    const maxTimeMs = 8 * 60 * 1000; // 8 minutes
    const timeRatio = Math.min(Math.max(elapsedMs / maxTimeMs, 0), 1);
    const speedBonus = Math.round(30 * (1 - timeRatio));
    score = 70 + speedBonus;
  }

  return {
    score,
    metrics: {
      completed: verification.valid,
      elapsedMs,
    },
  };
}

module.exports = Object.freeze({
  code: "N_QUEENS",
  slug: "n-queens",
  version: VERSION,

  generatePuzzle,
  verifySolution,
  calculateScore,
});
