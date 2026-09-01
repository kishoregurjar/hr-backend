const routes = require("./category.routes");
const service = require("./category.service");
const controller = require("./category.controller");
const repository = require("./category.repository");
const validator = require("./category.validator");
const dto = require("./category.dto");
const mapper = require("./category.mapper");
const constants = require("./category.constants");

/**
 * ==========================================================
 * Category Module Central Index Exporter
 * ==========================================================
 * Main export is Express Router so require("../modules/category") works directly.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

module.exports = routes;

module.exports.routes = routes;
module.exports.service = service;
module.exports.controller = controller;
module.exports.repository = repository;
module.exports.validator = validator;
module.exports.dto = dto;
module.exports.mapper = mapper;
module.exports.constants = constants;
