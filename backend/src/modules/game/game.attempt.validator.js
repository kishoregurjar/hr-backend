"use strict";

const { z } = require("zod");
const { BadRequestError } = require("../../common/errors");

const gameSlugSchema = z.object({
  candidateAssessmentId: z.string().trim().min(1, "candidateAssessmentId is required"),
  slug: z.string().trim().min(1, "game slug is required").max(100),
});

const attemptIdSchema = z.object({
  candidateAssessmentId: z.string().trim().min(1, "candidateAssessmentId is required"),
  attemptId: z.string().trim().min(1, "attemptId is required"),
});

const startGameSchema = z.object({}).strict();

const submitGameSchema = z
  .object({
    solution: z.any({
      required_error: "solution object is required for verification.",
    }),
  })
  .strict();

function validateGameSlugParams(params) {
  try {
    return gameSlugSchema.parse(params);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError(err.errors[0]?.message || "Invalid route parameters.");
    }
    throw err;
  }
}

function validateAttemptIdParams(params) {
  try {
    return attemptIdSchema.parse(params);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError(err.errors[0]?.message || "Invalid attempt parameters.");
    }
    throw err;
  }
}

function validateStartGame(body) {
  try {
    return startGameSchema.parse(body || {});
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError("Invalid payload for starting game attempt.");
    }
    throw err;
  }
}

function validateSubmitGame(body) {
  try {
    return submitGameSchema.parse(body || {});
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError(
        "Invalid submission payload. Client cannot provide score, metrics, or evaluation flags."
      );
    }
    throw err;
  }
}

module.exports = {
  gameSlugSchema,
  attemptIdSchema,
  startGameSchema,
  submitGameSchema,
  validateGameSlugParams,
  validateAttemptIdParams,
  validateStartGame,
  validateSubmitGame,
};
