"use strict";

function mapTelemetryResponse({ accepted, cheat }) {
  return {
    accepted,
    risk: {
      severity: cheat.severity,
      flags: cheat.flags,
    },
  };
}

module.exports = {
  mapTelemetryResponse,
};
