"use strict";

const { NotFoundError, BadRequestError, ForbiddenError } = require("../../common/errors");
const { GAMES_METADATA, GAME_SLUGS } = require("./game.constants");
const { getGameMetadataBySlug, getAllGameMetadata } = require("./game.registry");
const gameSuperAdminRepository = require("./game.super-admin.repository");
const gameSuperAdminService = require("./game.super-admin.service");
const { prisma } = require("../../config/prisma");

const zipEngine = require("./engines/zipEngine");
const tangoEngine = require("./engines/tangoEngine");
const sudokuEngine = require("./engines/sudokuEngine");
const mahjongEngine = require("./engines/mahjongEngine");

class GameService {
  async getAllGames() {
    const list = await gameSuperAdminService.listGames();
    return list;
  }

  async getGameBySlug(slug) {
    const metadata = getGameMetadataBySlug(slug);
    if (!metadata) {
      throw new NotFoundError(`Game not found with identifier: ${slug}`);
    }
    const game = await gameSuperAdminService.getGame(metadata.code || metadata.id);
    return game;
  }

  async assertGameIsActive(slug) {
    const metadata = getGameMetadataBySlug(slug);
    if (!metadata) {
      throw new NotFoundError(`Game not found with identifier: ${slug}`, "GAME_NOT_FOUND");
    }

    const game = await gameSuperAdminService.getGame(metadata.code || metadata.id);
    if (!game || game.isActive === false) {
      const error = new ForbiddenError("This game is currently disabled.", "GAME_DISABLED");
      error.statusCode = 403;
      throw error;
    }

    return game;
  }

  async generatePuzzle(slug, config = {}) {
    await this.assertGameIsActive(slug);
    const normalizedSlug = String(slug || "").toLowerCase();

    switch (normalizedSlug) {
      case GAME_SLUGS.ZIP:
      case "zip-pathfinder":
        return zipEngine.generateZip(config);

      case GAME_SLUGS.TANGO:
        return tangoEngine.generateTango(config);

      case GAME_SLUGS.SUDOKU:
      case "mini-sudoku":
      case "mini_sudoku":
        return sudokuEngine.generateSudoku(config);

      case GAME_SLUGS.MAHJONG:
      case "mahjong-tile-match":
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

  async verifySolution(slug, solution, gameData) {
    await this.assertGameIsActive(slug);
    const normalizedSlug = String(slug || "").toLowerCase();

    switch (normalizedSlug) {
      case GAME_SLUGS.ZIP:
      case "zip-pathfinder":
        return zipEngine.verifyZip(solution, gameData);

      case GAME_SLUGS.TANGO:
        return tangoEngine.verifyTango(solution, gameData);

      case GAME_SLUGS.SUDOKU:
      case "mini-sudoku":
      case "mini_sudoku":
        return sudokuEngine.verifySudoku(solution, gameData);

      case GAME_SLUGS.MAHJONG:
      case "mahjong-tile-match":
        return mahjongEngine.verifyMahjong(solution, gameData);

      default:
        throw new BadRequestError(`Unsupported game type: ${slug}`);
    }
  }

  async syncGameRegistry(tx = prisma) {
    const games = getAllGameMetadata();
    if (!tx.game) {
      return games.length;
    }
    for (const metadata of games) {
      await tx.game.upsert({
        where: {
          code: metadata.code,
        },
        create: {
          code: metadata.code,
          name: metadata.name,
          description: metadata.description,
          isActive: true,
        },
        update: {
          name: metadata.name,
          description: metadata.description,
        },
      });
    }
    return games.length;
  }
}

module.exports = new GameService();
