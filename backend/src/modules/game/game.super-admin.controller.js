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
const socketService = require("../../socket/socket.service");

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
    
    // Emit real-time update to all connected clients
    const socketPayload = {
      gameId: game.id,
      isActive: game.isActive,
    };
    if (socketService.io) {
      socketService.io.emit("GAME_STATUS_UPDATED", socketPayload);
    } else {
      socketService.emitGlobalHR("GAME_STATUS_UPDATED", socketPayload);
    }

    return SuccessResponse.send(
      res,
      {
        message: `Game status updated successfully to ${payload.isActive ? "ACTIVE" : "INACTIVE"}`,
        data: buildGameResponse(game),
      },
      StatusCodes.OK
    );
  });

  getCompanyGames = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const games = await service.getCompanyGameConfigs(companyId);
    return SuccessResponse.send(
      res,
      {
        message: "Company games retrieved successfully",
        data: games,
      },
      StatusCodes.OK
    );
  });

  updateCompanyGameStatus = asyncHandler(async (req, res) => {
    const { companyId, gameId } = req.params;
    const { status, isActive } = req.body;
    const targetStatus = status !== undefined ? status : (isActive ? "Active" : "Inactive");
    
    const updated = await service.updateCompanyGameStatus(companyId, gameId, targetStatus);

    // Emit real-time socket event to all connected clients & company rooms
    const socketPayload = {
      companyId,
      gameId,
      status: updated.status,
      isActive: updated.status === "Active",
    };
    if (socketService.io) {
      socketService.io.emit("GAME_STATUS_UPDATED", socketPayload);
    } else {
      socketService.emitToCompany(companyId, "GAME_STATUS_UPDATED", socketPayload);
      socketService.emitGlobalHR("GAME_STATUS_UPDATED", socketPayload);
    }

    return SuccessResponse.send(
      res,
      {
        message: `Company game status updated successfully to ${updated.status}`,
        data: updated,
      },
      StatusCodes.OK
    );
  });

  bulkUpdateCompanyGameStatus = asyncHandler(async (req, res) => {
    const { companyIds, gameId, status, isActive } = req.body;
    const targetStatus = status !== undefined ? status : (isActive ? "Active" : "Inactive");

    const result = await service.bulkUpdateCompanyGameStatus(companyIds, gameId, targetStatus);

    // Emit real-time socket event to all connected clients & company rooms
    const socketPayload = {
      companyIds,
      gameId,
      status: result.status,
      isActive: result.status === "Active",
    };
    if (socketService.io) {
      socketService.io.emit("GAME_STATUS_UPDATED", socketPayload);
    } else {
      socketService.emitGlobalHR("GAME_STATUS_UPDATED", socketPayload);
    }

    return SuccessResponse.send(
      res,
      {
        message: `Game status updated for ${result.updatedCount} companies to ${result.status}`,
        data: result,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new GameSuperAdminController();


