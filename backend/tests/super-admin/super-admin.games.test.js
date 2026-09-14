"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { GAMES_METADATA, GAME_CODES } = require("../../src/modules/game/game.constants");
const gameRegistry = require("../../src/modules/game/game.registry");
const gameSuperAdminService = require("../../src/modules/game/game.super-admin.service");
const gameService = require("../../src/modules/game/game.service");

test("Super Admin Games - Registry Consistency", async () => {
  const metadataList = gameRegistry.getAllGameMetadata();
  assert.equal(metadataList.length, 4);

  const codes = metadataList.map((g) => g.code);
  const slugs = metadataList.map((g) => g.slug);

  assert.equal(new Set(codes).size, codes.length, "Game codes must be unique");
  assert.equal(new Set(slugs).size, slugs.length, "Game slugs must be unique");
});

test("Super Admin Games - List Platform Games", async () => {
  const result = await gameSuperAdminService.listGames();
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 4);

  const firstGame = result[0];
  assert.ok(firstGame.code);
  assert.ok(firstGame.name);
  assert.equal(firstGame.isActive, true);
});

test("Super Admin Games - Get Game By ID or Code", async () => {
  const game = await gameSuperAdminService.getGame("ZIP_PATHFINDER");
  assert.ok(game);
  assert.equal(game.name, "Zip Pathfinder");
  assert.equal(game.isActive, true);
});

test("Super Admin Games - Toggle Enable / Disable Status", async () => {
  // 1. Disable ZIP_PATHFINDER
  const updatedDisabled = await gameSuperAdminService.updateGameStatus("ZIP_PATHFINDER", false);
  assert.equal(updatedDisabled.isActive, false);

  // 2. Puzzle generation for disabled game should fail with GAME_DISABLED error
  await assert.rejects(
    async () => {
      await gameService.generatePuzzle("zip");
    },
    (err) => {
      assert.equal(err.code, "GAME_DISABLED");
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // 3. Re-enable ZIP_PATHFINDER
  const updatedEnabled = await gameSuperAdminService.updateGameStatus("ZIP_PATHFINDER", true);
  assert.equal(updatedEnabled.isActive, true);

  // 4. Puzzle generation for enabled game should succeed
  const puzzle = await gameService.generatePuzzle("zip");
  assert.ok(puzzle);
});

test("Super Admin Games - Updating to Same Status Throws ConflictError", async () => {
  await assert.rejects(
    async () => {
      await gameSuperAdminService.updateGameStatus("ZIP_PATHFINDER", true);
    },
    (err) => {
      assert.equal(err.code, "GAME_ALREADY_IN_STATUS");
      return true;
    }
  );
});
