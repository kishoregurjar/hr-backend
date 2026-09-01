"use strict";

/**
 * ==========================================================
 * Centralized Enterprise Error Codes Contract
 * ==========================================================
 * Stable, machine-readable error codes contract for Frontend & API Clients.
 * Placed at src/common/error-codes.js matching Clean Architecture.
 * ==========================================================
 */

const ERROR_CODES = Object.freeze({
  // Attempt Module
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
  ATTEMPT_ALREADY_SUBMITTED: "ATTEMPT_ALREADY_SUBMITTED",
  INVALID_ATTEMPT_STATE: "INVALID_ATTEMPT_STATE",
  INVALID_CANDIDATE_SESSION: "INVALID_CANDIDATE_SESSION",

  // Assessment Module
  ASSESSMENT_NOT_FOUND: "ASSESSMENT_NOT_FOUND",
  ASSESSMENT_TITLE_ALREADY_EXISTS: "ASSESSMENT_TITLE_ALREADY_EXISTS",

  // Options & Questions
  INVALID_OPTIONS: "INVALID_OPTIONS",
  DUPLICATE_OPTIONS: "DUPLICATE_OPTIONS",

  // Invitation Lifecycle
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_EXPIRED: "INVITATION_EXPIRED",
  INVITATION_REVOKED: "INVITATION_REVOKED",

  // OTP Verification
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_INVALID: "OTP_INVALID",
  OTP_MAX_ATTEMPTS: "OTP_MAX_ATTEMPTS",
  OTP_RATE_LIMITED: "OTP_RATE_LIMITED",

  // System & Security
  ACCESS_DENIED: "ACCESS_DENIED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_ALREADY_EXISTS: "RESOURCE_ALREADY_EXISTS",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
});

module.exports = ERROR_CODES;
