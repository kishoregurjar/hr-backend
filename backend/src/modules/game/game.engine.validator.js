"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");

function validateGameEngine(engine) {
  if (!engine || typeof engine !== "object") {
    throw new TypeError(
      GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE
    );
  }

  if (typeof engine.generatePuzzle !== "function") {
    throw new TypeError(
      "Game engine must implement generatePuzzle()"
    );
  }

  if (typeof engine.verifySolution !== "function") {
    throw new TypeError(
      "Game engine must implement verifySolution()"
    );
  }

  if (typeof engine.calculateScore !== "function") {
    throw new TypeError(
      "Game engine must implement calculateScore()"
    );
  }

  return true;
}

function validateGeneratedPuzzle(data) {
  if (!data || typeof data !== "object") {
    throw new TypeError(
      GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_PUZZLE
    );
  }

  if (
    data.puzzle === undefined ||
    data.solution === undefined
  ) {
    throw new TypeError(
      GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_PUZZLE
    );
  }

  if (
    typeof data.seed !== "string" ||
    data.seed.length === 0 ||
    data.seed.length > 256
  ) {
    throw new TypeError(
      "Invalid game seed"
    );
  }

  if (
    !Number.isInteger(data.version) ||
    data.version <= 0
  ) {
    throw new TypeError(
      "Invalid game puzzle version"
    );
  }

  return data;
}

module.exports = {
  validateGameEngine,
  validateGeneratedPuzzle,
};
