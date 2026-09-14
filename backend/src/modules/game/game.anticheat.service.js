"use strict";

const { GAME_TELEMETRY_CONSTANTS } = require("./game.telemetry.constants");

function evaluateTelemetry(events = []) {
  let focusLostCount = 0;
  let visibilityHiddenCount = 0;
  let fullscreenExitCount = 0;

  for (const event of events) {
    switch (event.eventType) {
      case GAME_TELEMETRY_CONSTANTS.EVENT_TYPES.GAME_FOCUS_LOST:
        focusLostCount += 1;
        break;

      case GAME_TELEMETRY_CONSTANTS.EVENT_TYPES.VISIBILITY_HIDDEN:
        visibilityHiddenCount += 1;
        break;

      case GAME_TELEMETRY_CONSTANTS.EVENT_TYPES.FULLSCREEN_EXITED:
        fullscreenExitCount += 1;
        break;

      default:
        break;
    }
  }

  const flags = [];

  if (focusLostCount >= 3) {
    flags.push("REPEATED_FOCUS_LOSS");
  }

  if (visibilityHiddenCount >= 3) {
    flags.push("REPEATED_VISIBILITY_CHANGE");
  }

  if (fullscreenExitCount >= 2) {
    flags.push("REPEATED_FULLSCREEN_EXIT");
  }

  let severity = GAME_TELEMETRY_CONSTANTS.CHEAT_SEVERITY.NONE;

  if (flags.length >= 3) {
    severity = GAME_TELEMETRY_CONSTANTS.CHEAT_SEVERITY.HIGH;
  } else if (flags.length === 2) {
    severity = GAME_TELEMETRY_CONSTANTS.CHEAT_SEVERITY.MEDIUM;
  } else if (flags.length === 1) {
    severity = GAME_TELEMETRY_CONSTANTS.CHEAT_SEVERITY.LOW;
  }

  return {
    severity,
    flags,
    signals: {
      focusLostCount,
      visibilityHiddenCount,
      fullscreenExitCount,
    },
  };
}

module.exports = {
  evaluateTelemetry,
};
