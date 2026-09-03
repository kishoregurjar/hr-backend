"use strict";

const gameRoutes = require("./game.routes");
const gameService = require("./game.service");
const gameConstants = require("./game.constants");

module.exports = gameRoutes;
module.exports.gameService = gameService;
module.exports.gameConstants = gameConstants;
