"use strict";

const { z } = require("zod");
const { BadRequestError } = require("../../common/errors");

const updateGameStatusSchema = z.object({
  isActive: z.boolean({
    required_error: "isActive boolean is required.",
    invalid_type_error: "isActive must be a boolean.",
  }),
});

const gameIdParamSchema = z.object({
  gameId: z
    .string()
    .trim()
    .min(1, "gameId parameter is required"),
});

function validateUpdateGameStatus(payload) {
  try {
    return updateGameStatusSchema.parse(payload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError(err.errors[0]?.message || "Invalid payload format.");
    }
    throw err;
  }
}

function validateGameIdParam(params) {
  try {
    return gameIdParamSchema.parse(params);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new BadRequestError(err.errors[0]?.message || "Invalid parameters.");
    }
    throw err;
  }
}

module.exports = {
  updateGameStatusSchema,
  gameIdParamSchema,
  validateUpdateGameStatus,
  validateGameIdParam,
};
