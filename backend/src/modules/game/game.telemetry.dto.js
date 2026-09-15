"use strict";

function buildTelemetryResponse(data) {
  return {
    accepted: data.accepted,
    risk: data.risk,
  };
}

module.exports = {
  buildTelemetryResponse,
};
