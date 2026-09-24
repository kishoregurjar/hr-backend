"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("../super-admin/super-admin.authorization");
const controller = require("./game.super-admin.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/", controller.listGames);
router.get("/:gameId", controller.getGame);
router.patch("/:gameId/status", controller.updateGameStatus);

router.get("/companies/:companyId/games", controller.getCompanyGames);
router.patch("/companies/:companyId/games/:gameId/status", controller.updateCompanyGameStatus);

module.exports = router;

