const assessmentRoutes = require("./assessment.routes");
const assessmentService = require("./assessment.service");
const assessmentRepository = require("./assessment.repository");
const assessmentController = require("./assessment.controller");
const assessmentValidator = require("./assessment.validator");
const assessmentConstants = require("./assessment.constants");
const assessmentMapper = require("./assessment.mapper");

/**
 * ==========================================================
 * Assessment Module Index Exporter
 * ==========================================================
 * Main export is Express Router so require("../modules/assessment") works directly.
 * Matches 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */

module.exports = assessmentRoutes;

module.exports.routes = assessmentRoutes;
module.exports.service = assessmentService;
module.exports.repository = assessmentRepository;
module.exports.controller = assessmentController;
module.exports.validator = assessmentValidator;
module.exports.constants = assessmentConstants;
module.exports.mapper = assessmentMapper;
