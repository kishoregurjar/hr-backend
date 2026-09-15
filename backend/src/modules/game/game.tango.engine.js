"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { createGameSeed } = require("./game.engine.crypto");
const { generateTango, verifyTango } = require("./engines/tangoEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

const VERSION = 1;

function generatePuzzle({ seed = createGameSeed(), version = VERSION, difficulty = "medium" } = {}) {
  const generated = generateTango({ difficulty });

  const puzzleData = {
    puzzle: {
      type: generated.type || "tango",
      size: generated.size || 6,
      initial: generated.initial,
      constraints: generated.constraints,
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

  let candidateGrid = candidateSolution;
  if (candidateSolution && typeof candidateSolution === "object" && candidateSolution.grid) {
    candidateGrid = candidateSolution.grid;
  }

  if (!candidateGrid || typeof candidateGrid !== "object") {
    return {
      valid: false,
      reason: "INVALID_CANDIDATE_SOLUTION",
      error: "Candidate solution must be a grid object mapping cells to symbols",
    };
  }

  const result = verifyTango(candidateGrid, puzzle);

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
  const score = verification.valid ? 100 : 0;

  return {
    score,
    metrics: {
      completed: verification.valid,
      elapsedMs,
    },
  };
}

module.exports = Object.freeze({
  code: "TANGO",
  slug: "tango",
  version: VERSION,

  generatePuzzle,
  verifySolution,
  calculateScore,
});
