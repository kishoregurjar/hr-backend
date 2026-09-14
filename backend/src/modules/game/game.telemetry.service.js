"use strict";

const { NotFoundError, ConflictError } = require("../../common/errors");
const repository = require("./game.telemetry.repository");
const { GAME_TELEMETRY_CONSTANTS } = require("./game.telemetry.constants");
const { evaluateTelemetry } = require("./game.anticheat.service");

async function recordTelemetry({
  candidateId,
  candidateAssessmentId,
  attemptId,
  events,
  ipAddress,
  userAgent,
}) {
  const attempt = await repository.findAttemptForCandidate({
    attemptId,
    candidateAssessmentId,
    candidateId,
  });

  if (!attempt) {
    throw new NotFoundError(
      "Game attempt not found.",
      GAME_TELEMETRY_CONSTANTS.ERROR_CODES.GAME_ATTEMPT_NOT_FOUND
    );
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new ConflictError(
      "Game attempt is no longer active.",
      GAME_TELEMETRY_CONSTANTS.ERROR_CODES.GAME_ATTEMPT_NOT_ACTIVE
    );
  }

  const now = Date.now();
  const validEvents = events.filter((event) => {
    if (!event.clientAt) {
      return true;
    }
    const clientTime = new Date(event.clientAt).getTime();
    return Math.abs(now - clientTime) <= 5 * 60 * 1000;
  });

  if (!validEvents.length) {
    return {
      accepted: 0,
      cheat: {
        severity: GAME_TELEMETRY_CONSTANTS.CHEAT_SEVERITY.NONE,
        flags: [],
      },
    };
  }

  const allTelemetry = await repository.findTelemetryEvents(attemptId);
  const combinedEvents = [...allTelemetry, ...validEvents];
  const cheatEvaluation = evaluateTelemetry(combinedEvents);

  await repository.createManyEvents({
    attemptId,
    events: validEvents,
    ipAddress,
    userAgent,
    cheatSeverity: cheatEvaluation.severity,
    cheatFlags: cheatEvaluation.flags,
  });

  return {
    accepted: validEvents.length,
    cheat: cheatEvaluation,
  };
}

module.exports = {
  recordTelemetry,
};
