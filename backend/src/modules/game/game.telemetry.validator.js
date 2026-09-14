"use strict";

const { z } = require("zod");
const { BadRequestError } = require("../../common/errors");
const { GAME_TELEMETRY_CONSTANTS } = require("./game.telemetry.constants");

const eventTypes = Object.values(GAME_TELEMETRY_CONSTANTS.EVENT_TYPES);

const telemetryEventSchema = z
  .object({
    eventType: z.enum(eventTypes, {
      errorMap: () => ({ message: "Invalid telemetry event type." }),
    }),
    clientAt: z.string().datetime().optional(),
    sequence: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const telemetryBatchSchema = z
  .object({
    events: z
      .array(telemetryEventSchema)
      .min(1, "At least 1 event is required in telemetry batch.")
      .max(
        GAME_TELEMETRY_CONSTANTS.MAX_BATCH_SIZE,
        `Telemetry batch cannot exceed ${GAME_TELEMETRY_CONSTANTS.MAX_BATCH_SIZE} events.`
      ),
  })
  .strict();

function validateTelemetryBatch(body) {
  try {
    return telemetryBatchSchema.parse(body || {});
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues?.[0]?.message || err.errors?.[0]?.message || "Invalid telemetry batch payload.";
      throw new BadRequestError(`Invalid telemetry batch payload: ${msg}`);
    }
    throw err;
  }
}

module.exports = {
  telemetryEventSchema,
  telemetryBatchSchema,
  validateTelemetryBatch,
};
