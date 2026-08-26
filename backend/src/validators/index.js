const emailValidator = require("./email.validator");
const passwordValidator = require("./password.validator");
const paginationValidator = require("./pagination.validator");
const uuidValidator = require("./uuid.validator");

/**
 * ==========================================================
 * Global Reusable Zod Validators Index Exporter
 * ==========================================================
 * Centralized export facade for all global validator primitives.
 * ==========================================================
 */

module.exports = {
  emailValidator,
  passwordValidator,
  paginationValidator,
  uuidValidator,
};
