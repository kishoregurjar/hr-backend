"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const service = require("./game.attempt.service");
const {
  validateGameSlugParams,
  validateAttemptIdParams,
  validateStartGame,
  validateSubmitGame,
} = require("./game.attempt.validator");
const {
  buildStartGameAttemptResponse,
  buildSubmitGameAttemptResponse,
} = require("./game.attempt.dto");

class GameAttemptController {
  startGame = asyncHandler(async (req, res) => {
    const { candidateAssessmentId, slug } = validateGameSlugParams(req.params);
    validateStartGame(req.body);

    const result = await service.startGame({
      candidateId: req.user?.id || req.user?.userId,
      candidateAssessmentId,
      slug,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Game attempt started successfully",
        data: buildStartGameAttemptResponse(result),
      },
      StatusCodes.CREATED
    );
  });

  submitGame = asyncHandler(async (req, res) => {
    const { candidateAssessmentId, attemptId } = validateAttemptIdParams(req.params);
    const { solution } = validateSubmitGame(req.body);

    const result = await service.submitGame({
      candidateId: req.user?.id || req.user?.userId,
      candidateAssessmentId,
      attemptId,
      solution,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Game attempt verified and submitted successfully",
        data: buildSubmitGameAttemptResponse(result),
      },
      StatusCodes.OK
    );
  });
}

module.exports = new GameAttemptController();
