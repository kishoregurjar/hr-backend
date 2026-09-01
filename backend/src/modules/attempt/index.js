const attemptRoutes = require("./attempt.routes");
const constants = require("./attempt.constants");
const validators = require("./attempt.validator");
const attemptRepository = require("./attempt.repository");
const dtos = require("./attempt.dto");
const mappers = require("./attempt.mapper");
const attemptService = require("./attempt.service");
const attemptController = require("./attempt.controller");

/**
 * ==========================================================
 * Assessment Attempt Module Exporter Facade
 * ==========================================================
 * Main export is Express Router so require("../modules/attempt") works directly.
 * Matches 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */

module.exports = attemptRoutes;

module.exports.routes = attemptRoutes;
module.exports.constants = constants;
module.exports.validators = validators;
module.exports.repository = attemptRepository;
module.exports.dtos = dtos;
module.exports.mappers = mappers;
module.exports.service = attemptService;
module.exports.controller = attemptController;
