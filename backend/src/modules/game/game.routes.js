"use strict";

const express = require("express");
const router = express.Router();
const gameController = require("./game.controller");

/**
 * ==========================================================
 * Game Module Routes
 * ==========================================================
 * Base path: /api/v1/games
 * ==========================================================
 */

router.get("/", gameController.listGames);
router.get("/:slug", gameController.getGame);
router.get("/:slug/puzzle", gameController.getPuzzle);
router.post("/:slug/verify", gameController.verifyPuzzle);

module.exports = router;
