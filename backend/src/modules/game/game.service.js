"use strict";

const { NotFoundError, BadRequestError } = require("../../common/errors");
const { GAMES_METADATA, GAME_SLUGS } = require("./game.constants");
const zipEngine = require("./engines/zipEngine");
const tangoEngine = require("./engines/tangoEngine");
const sudokuEngine = require("./engines/sudokuEngine");
const mahjongEngine = require("./engines/mahjongEngine");

class GameService {
  getAllGames() {
    return GAMES_METADATA;
  }

  getGameBySlug(slug) {
    const normalizedSlug = String(slug || "").toLowerCase();
    const game = GAMES_METADATA.find(
      (g) => g.slug === normalizedSlug || g.id === normalizedSlug
    );
    if (!game) {
      throw new NotFoundError(`Game not found with identifier: ${slug}`);
    }
    return game;
  }

  generatePuzzle(slug, config = {}) {
    const normalizedSlug = String(slug || "").toLowerCase();

    switch (normalizedSlug) {
      case GAME_SLUGS.ZIP:
        return zipEngine.generateZip(config);

      case GAME_SLUGS.TANGO:
        return tangoEngine.generateTango(config);

      case GAME_SLUGS.SUDOKU:
      case "mini-sudoku":
      case "mini_sudoku":
        return sudokuEngine.generateSudoku(config);

      case GAME_SLUGS.MAHJONG:
        return {
          type: "mahjong",
          difficulty: config.difficulty || "medium",
          board: mahjongEngine.createBoard(config.difficulty || "medium"),
          maxHints: config.maxHints ?? 3,
          maxShuffles: config.maxShuffles ?? 3,
        };

      default:
        throw new BadRequestError(`Unsupported game type: ${slug}`);
    }
  }

  verifySolution(slug, solution, gameData) {
    const normalizedSlug = String(slug || "").toLowerCase();

    switch (normalizedSlug) {
      case GAME_SLUGS.ZIP:
        return zipEngine.verifyZip(solution, gameData);

      case GAME_SLUGS.TANGO:
        return tangoEngine.verifyTango(solution, gameData);

      case GAME_SLUGS.SUDOKU:
      case "mini-sudoku":
      case "mini_sudoku":
        return sudokuEngine.verifySudoku(solution, gameData);

      case GAME_SLUGS.MAHJONG:
        return mahjongEngine.verifyMahjong(solution, gameData);

      default:
        throw new BadRequestError(`Unsupported game type: ${slug}`);
    }
  }
}

module.exports = new GameService();
