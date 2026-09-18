"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { validateTelemetryBatch } = require("./game.telemetry.validator");
const service = require("./game.telemetry.service");
const mapper = require("./game.telemetry.mapper");
const { buildTelemetryResponse } = require("./game.telemetry.dto");

class GameTelemetryController {
  recordTelemetry = asyncHandler(async (req, res) => {
    const { events } = validateTelemetryBatch(req.body);

    const candidateId = req.user?.id || req.user?.userId || req.candidateSession?.candidateId || req.candidateSession?.id;

    const result = await service.recordTelemetry({
      candidateId,
      candidateAssessmentId: req.params.candidateAssessmentId,
      attemptId: req.params.attemptId,
      events,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.get("user-agent") || null,
    });

    const mappedData = mapper.mapTelemetryResponse(result);
    return SuccessResponse.send(
      res,
      {
        message: "Telemetry batch processed successfully",
        data: buildTelemetryResponse(mappedData),
      },
      StatusCodes.ACCEPTED
    );
  });
}

module.exports = new GameTelemetryController();
