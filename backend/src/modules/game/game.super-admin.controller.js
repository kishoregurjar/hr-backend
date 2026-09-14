"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const service = require("./game.super-admin.service");
const {
  validateGameIdParam,
  validateUpdateGameStatus,
} = require("./game.super-admin.validator");
const {
  buildGameListResponse,
  buildGameResponse,
} = require("./game.super-admin.dto");

class GameSuperAdminController {
  listGames = asyncHandler(async (req, res) => {
    const games = await service.listGames();
    return SuccessResponse.send(
      res,
      {
        message: "Platform games retrieved successfully",
        data: buildGameListResponse(games),
      },
      StatusCodes.OK
    );
  });

  getGame = asyncHandler(async (req, res) => {
    const { gameId } = validateGameIdParam(req.params);
    const game = await service.getGame(gameId);
    return SuccessResponse.send(
      res,
      {
        message: "Game details retrieved successfully",
        data: buildGameResponse(game),
      },
      StatusCodes.OK
    );
  });

  updateGameStatus = asyncHandler(async (req, res) => {
    const { gameId } = validateGameIdParam(req.params);
    const payload = validateUpdateGameStatus(req.body);
    const game = await service.updateGameStatus(gameId, payload.isActive);
    return SuccessResponse.send(
      res,
      {
        message: `Game status updated successfully to ${payload.isActive ? "ACTIVE" : "INACTIVE"}`,
        data: buildGameResponse(game),
      },
      StatusCodes.OK
    );
  });
}

module.exports = new GameSuperAdminController();
