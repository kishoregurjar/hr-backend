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
  async getAllGames(companyId = null) {
    const list = await gameSuperAdminService.listGames();
    if (!companyId || !prisma.companyGameConfig) return list;

    try {
      const configs = await prisma.companyGameConfig.findMany({
        where: { companyId },
        include: { game: true },
      });

      const configMap = new Map();
      configs.forEach((c) => {
        if (c.gameId) configMap.set(String(c.gameId).toLowerCase(), c);
        if (c.game?.code) {
          const codeStr = String(c.game.code).toLowerCase();
          configMap.set(codeStr, c);
          configMap.set(codeStr.replace(/_/g, "-"), c);
        }
        if (c.game?.id) configMap.set(String(c.game.id).toLowerCase(), c);
      });

      return list.map((game) => {
        const gameIdKey = String(game.id || "").toLowerCase();
        const gameCodeKey = String(game.code || "").toLowerCase();
        const gameSlugKey = String(game.slug || "").toLowerCase();

        const savedConfig =
          configMap.get(gameIdKey) ||
          configMap.get(gameCodeKey) ||
          configMap.get(gameCodeKey.replace(/_/g, "-")) ||
          configMap.get(gameSlugKey);

        if (savedConfig) {
          const formattedDiff =
            savedConfig.difficulty.charAt(0).toUpperCase() +
            savedConfig.difficulty.slice(1).toLowerCase();

          const isCompanyActive = savedConfig.status === "Active" || savedConfig.status === "ACTIVE";
          const finalIsActive = Boolean(game.isActive) && isCompanyActive;

          return {
            ...game,
            isActive: finalIsActive,
            status: finalIsActive ? "ACTIVE" : "INACTIVE",
            companyStatus: savedConfig.status,
            difficulty: formattedDiff,
            duration: savedConfig.duration,
            passingScore: savedConfig.passingScore,
            config: {
              ...(game.config || {}),
              difficulty: savedConfig.difficulty.toLowerCase(),
              duration: savedConfig.duration,
              passingScore: savedConfig.passingScore,
            },
          };
        }
        return game;
      });
    } catch (e) {
      return list;
    }
  }

  async updateCompanyGameConfig(companyId, gameSlugOrId, configData = {}) {
    if (!companyId) {
      throw new BadRequestError("Company context is required to update game config.");
    }

    const metadata = getGameMetadataBySlug(gameSlugOrId);
    let game = await gameSuperAdminService.getGame(gameSlugOrId).catch(() => null);
    if (!game && metadata) {
      game = await gameSuperAdminService.getGame(metadata.code || metadata.id).catch(() => null);
    }
    if (!game && metadata) {
      game = { id: metadata.id, code: metadata.code, name: metadata.name };
    }

    if (!game) {
      throw new NotFoundError(`Game not found: ${gameSlugOrId}`);
    }

    // Ensure Game record exists in DB for foreign key constraint
    let dbGame = await prisma.game.findFirst({
      where: {
        OR: [{ id: game.id }, { code: game.code || metadata?.code || gameSlugOrId }],
      },
    });

    if (!dbGame) {
      dbGame = await prisma.game.create({
        data: {
          code: game.code || metadata?.code || gameSlugOrId,
          name: game.name || metadata?.name || gameSlugOrId,
          description: game.description || metadata?.description || null,
          isActive: true,
        },
      });
    }

    const diffUpper = String(configData.difficulty || "EASY").toUpperCase();
    const duration = parseInt(configData.duration, 10) || 10;
    const passingScore = parseInt(configData.passingScore, 10) || 70;
    const status = configData.status || "Active";

    const updated = await prisma.companyGameConfig.upsert({
      where: {
        companyId_gameId: {
          companyId,
          gameId: dbGame.id,
        },
      },
      create: {
        companyId,
        gameId: dbGame.id,
        difficulty: diffUpper === "MEDIUM" ? "MEDIUM" : diffUpper === "HARD" ? "HARD" : "EASY",
        duration,
        passingScore,
        status,
        config: configData.config || null,
      },
      update: {
        difficulty: diffUpper === "MEDIUM" ? "MEDIUM" : diffUpper === "HARD" ? "HARD" : "EASY",
        duration,
        passingScore,
        status,
        config: configData.config || null,
      },
    });

    const formattedDiff =
      updated.difficulty.charAt(0).toUpperCase() + updated.difficulty.slice(1).toLowerCase();

    return {
      ...game,
      difficulty: formattedDiff,
      duration: updated.duration,
      passingScore: updated.passingScore,
      status: updated.status,
      config: {
        ...(game.config || {}),
        difficulty: updated.difficulty.toLowerCase(),
        duration: updated.duration,
        passingScore: updated.passingScore,
      },
    };
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
