"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const gameService = require("./game.service");

class GameController {
  listGames = asyncHandler(async (req, res) => {
    const games = gameService.getAllGames();
    return SuccessResponse.send(
      res,
      {
        message: "Games retrieved successfully",
        data: games,
      },
      StatusCodes.OK
    );
  });

  getGame = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const game = gameService.getGameBySlug(slug);
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
    const puzzle = gameService.generatePuzzle(slug, config);

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
    const result = gameService.verifySolution(slug, solution, gameData);

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
