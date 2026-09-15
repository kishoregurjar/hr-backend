"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");
const { createGameSeed } = require("./game.engine.crypto");
const { generateZip, verifyZip } = require("./engines/zipEngine");
const { validateGeneratedPuzzle } = require("./game.engine.validator");

const VERSION = 1;

function generatePuzzle({ seed = createGameSeed(), version = VERSION } = {}) {
  const generated = generateZip({ seed });

  const puzzleData = {
    puzzle: {
      type: generated.type || "zip",
      size: generated.size || 8,
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

function verifySolution({ puzzle, solution, candidateSolution }) {
  if (!puzzle || typeof puzzle !== "object") {
    return {
      valid: false,
      reason: "INVALID_PUZZLE",
      error: "Puzzle payload is required",
    };
  }

  let candidatePath = candidateSolution;
  if (candidateSolution && typeof candidateSolution === "object" && Array.isArray(candidateSolution.path)) {
    candidatePath = candidateSolution.path;
  }

  if (!Array.isArray(candidatePath)) {
    return {
      valid: false,
      reason: "INVALID_CANDIDATE_SOLUTION",
      error: "Candidate solution path must be an array of cell coordinates",
    };
  }

  const result = verifyZip(candidatePath, puzzle);

  return {
    valid: Boolean(result.valid),
    reason: result.valid ? null : (result.error || "INVALID_PATH"),
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
  code: "ZIP_PATHFINDER",
  slug: "zip-pathfinder",
  version: VERSION,

  generatePuzzle,
  verifySolution,
  calculateScore,
});
