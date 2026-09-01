const routes = require("./tag.routes");
const service = require("./tag.service");
const controller = require("./tag.controller");
const repository = require("./tag.repository");
const validator = require("./tag.validator");
const dto = require("./tag.dto");
const mapper = require("./tag.mapper");
const constants = require("./tag.constants");

/**
 * ==========================================================
 * Tag Module Central Index Exporter
 * ==========================================================
 * Main export is Express Router so require("../modules/tag") works directly.
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
