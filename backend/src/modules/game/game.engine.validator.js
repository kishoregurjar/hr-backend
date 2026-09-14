"use strict";

const { z } = require("zod");

const generatedPuzzleSchema = z
  .object({
    puzzle: z.unknown(),
    solution: z.unknown(),
    seed: z.string().min(1).max(256),
    version: z.number().int().positive(),
  })
  .strict();

const gameEngineSchema = z
  .object({
    generatePuzzle: z.function(),
    verifySolution: z.function(),
    calculateScore: z.function(),
    version: z.number().int().positive().optional(),
  })
  .strict();

function validateGeneratedPuzzle(data) {
  return generatedPuzzleSchema.parse(data);
}

function validateGameEngine(engine) {
  return gameEngineSchema.parse(engine);
}

module.exports = {
  generatedPuzzleSchema,
  gameEngineSchema,
  validateGeneratedPuzzle,
  validateGameEngine,
};
