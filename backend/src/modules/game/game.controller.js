"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const gameService = require("./game.service");

const { prisma } = require("../../config/prisma");
const { verifyAccessToken } = require("../auth/auth.utils");
const authRepository = require("../auth/auth.repository");

class GameController {
  listGames = asyncHandler(async (req, res) => {
    let companyId = req.user?.companyId || null;
    
    // Attempt soft token parse if req.user is not yet attached
    if (!companyId && req.headers.authorization?.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        const payload = verifyAccessToken(token);
        if (payload?.sub) {
          const user = await authRepository.findUserById(payload.sub);
          if (user) req.user = user;
        }
      } catch (e) {}
    }

    if (!companyId && req.user?.id) {
      const member = await prisma.companyMember.findFirst({
        where: { userId: req.user.id },
        select: { companyId: true },
      });
      companyId = member?.companyId || null;
    }

    const games = await gameService.getAllGames(companyId);
    return SuccessResponse.send(
      res,
      {
        message: "Games retrieved successfully",
        data: games,
      },
      StatusCodes.OK
    );
  });

  updateGameConfig = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    let companyId = req.user?.companyId || null;

    if (!companyId && req.user?.id) {
      const member = await prisma.companyMember.findFirst({
        where: { userId: req.user.id },
        select: { companyId: true },
      });
      companyId = member?.companyId || null;
    }

    if (!companyId) {
      // Fallback: look up the first company if available
      const firstCompany = await prisma.company.findFirst();
      companyId = firstCompany?.id || null;
    }

    const updatedGame = await gameService.updateCompanyGameConfig(
      companyId,
      slug,
      req.body || {}
    );

    return SuccessResponse.send(
      res,
      {
        message: "Game configuration saved successfully",
        data: updatedGame,
      },
      StatusCodes.OK
    );
  });

  getGame = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const game = await gameService.getGameBySlug(slug);
    return SuccessResponse.send(
      res,
      {
        message: "Game details retrieved successfully",
        data: game,
      },
      StatusCodes.OK
    );
  });

  getPuzzle = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const config = req.query || {};
    const puzzle = await gameService.generatePuzzle(slug, config);

    return SuccessResponse.send(
      res,
      {
        message: "Game puzzle generated successfully",
        data: puzzle,
      },
      StatusCodes.OK
    );
  });

  verifyPuzzle = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { solution, gameData } = req.body || {};
    const result = await gameService.verifySolution(slug, solution, gameData);

    return SuccessResponse.send(
      res,
      {
        message: result.valid ? "Puzzle solved correctly" : result.error || "Incorrect solution",
        data: result,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new GameController();
