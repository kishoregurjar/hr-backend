/**
 * ==========================================================
 * Category Module Unified Constants
 * ==========================================================
 * Single source of truth for Category limits, error codes, and messages.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

const CATEGORY_LIMITS = Object.freeze({
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 1000,
});

const CATEGORY_MESSAGES = Object.freeze({
  CREATED: "Category created successfully.",
  UPDATED: "Category updated successfully.",
  DELETED: "Category deleted successfully.",
  RESTORED: "Category restored successfully.",
  FETCHED: "Category fetched successfully.",
  LIST_FETCHED: "Categories fetched successfully.",
});

const CATEGORY_ERRORS = Object.freeze({
  ALREADY_EXISTS: "CATEGORY_ALREADY_EXISTS",
  NOT_FOUND: "CATEGORY_NOT_FOUND",
  INVALID_NAME: "CATEGORY_INVALID_NAME",
  IN_USE: "CATEGORY_IN_USE",
  ALREADY_ACTIVE: "CATEGORY_ALREADY_ACTIVE",
});

module.exports = {
  CATEGORY_LIMITS,
  CATEGORY_MESSAGES,
  CATEGORY_ERRORS,
};
