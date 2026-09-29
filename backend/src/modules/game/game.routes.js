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

const attemptRoutes = require("./game.attempt.routes");
const telemetryRoutes = require("./game.telemetry.routes");

const requireAuth = require("../../middleware/requireAuth");

router.use("/", attemptRoutes);
router.use("/", telemetryRoutes);
router.get("/", requireAuth, gameController.listGames);
router.patch("/:slug/config", requireAuth, gameController.updateGameConfig);
router.get("/:slug", gameController.getGame);
router.get("/:slug/puzzle", gameController.getPuzzle);
router.post("/:slug/verify", gameController.verifyPuzzle);

module.exports = router;
