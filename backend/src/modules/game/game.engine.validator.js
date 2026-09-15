"use strict";

const { GAME_ENGINE_CONSTANTS } = require("./game.engine.constants");

function validateGameEngine(engine) {
  if (!engine || typeof engine !== "object") {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE);
  }

  if (
    typeof engine.generatePuzzle !== "function" ||
    typeof engine.verifySolution !== "function" ||
    typeof engine.calculateScore !== "function"
  ) {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE);
  }

  return true;
}

function validateGameDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE);
  }

  if (
    typeof definition.code !== "string" ||
    definition.code.trim().length === 0 ||
    definition.code.length > GAME_ENGINE_CONSTANTS.MAX_GAME_CODE_LENGTH
  ) {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_GAME_CODE);
  }

  if (
    typeof definition.slug !== "string" ||
    definition.slug.trim().length === 0 ||
    definition.slug.length > GAME_ENGINE_CONSTANTS.MAX_GAME_SLUG_LENGTH
  ) {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_GAME_SLUG);
  }

  if (
    !Number.isInteger(definition.version) ||
    definition.version <= 0 ||
    definition.version > GAME_ENGINE_CONSTANTS.MAX_ENGINE_VERSION
  ) {
    throw new TypeError(
      GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE_VERSION
    );
  }

  validateGameEngine(definition.engine);

  return true;
}

function validateGeneratedPuzzle(data) {
  if (!data || typeof data !== "object") {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_PUZZLE);
  }

  if (data.puzzle === undefined || data.solution === undefined) {
    throw new TypeError(GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_PUZZLE);
  }

  if (
    typeof data.seed !== "string" ||
    data.seed.length === 0 ||
    data.seed.length > 256
  ) {
    throw new TypeError("Invalid game seed");
  }

  if (!Number.isInteger(data.version) || data.version <= 0) {
    throw new TypeError(
      GAME_ENGINE_CONSTANTS.ERROR_CODES.INVALID_ENGINE_VERSION
    );
  }

  return data;
}

module.exports = {
  validateGameEngine,
  validateGameDefinition,
  validateGeneratedPuzzle,
};
