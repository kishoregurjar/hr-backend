/**
 * ==========================================================
 * Tag Module Unified Constants
 * ==========================================================
 * Single source of truth for Tag limits, error codes, and messages.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

const TAG_LIMITS = Object.freeze({
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  DESCRIPTION_MAX_LENGTH: 500,
});

const TAG_MESSAGES = Object.freeze({
  CREATED: "Tag created successfully.",
  UPDATED: "Tag updated successfully.",
  DELETED: "Tag deleted successfully.",
  RESTORED: "Tag restored successfully.",
  FETCHED: "Tag fetched successfully.",
  LIST_FETCHED: "Tags fetched successfully.",
});

const TAG_ERRORS = Object.freeze({
  ALREADY_EXISTS: "TAG_ALREADY_EXISTS",
  NOT_FOUND: "TAG_NOT_FOUND",
  INVALID_NAME: "TAG_INVALID_NAME",
  IN_USE: "TAG_IN_USE",
  ALREADY_ACTIVE: "TAG_ALREADY_ACTIVE",
});

module.exports = {
  TAG_LIMITS,
  TAG_MESSAGES,
  TAG_ERRORS,
};
