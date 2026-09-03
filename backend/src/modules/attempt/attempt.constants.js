"use strict";

const crypto = require("node:crypto");

/**
 * ==========================================================
 * Assessment Attempt Module Constants
 * ==========================================================
 * Central source of truth for:
 * - Attempt lifecycle states
 * - Attempt limits
 * - Answer limits
 * - Evaluation statuses
 * - State transition matrix
 * - Success messages
 * - Error codes
 * Placed directly at src/modules/attempt/attempt.constants.js
 * matching 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */

/**
 * ------------------------------------------------------------
 * Attempt Lifecycle Status
 * ------------------------------------------------------------
 * IN_PROGRESS : Candidate has started the assessment attempt.
 * SUBMITTED   : Candidate successfully submitted the attempt.
 * EXPIRED     : Attempt exceeded allocated time before submission.
 * CANCELLED   : Attempt was cancelled by administrator/system.
 * ------------------------------------------------------------
 */
const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

/**
 * ------------------------------------------------------------
 * Attempt Limits & Boundaries
 * ------------------------------------------------------------
 */
const ATTEMPT_LIMITS = Object.freeze({
  MIN_ATTEMPT_NUMBER: 1,
  MAX_ATTEMPT_NUMBER: 10,
  MIN_QUESTIONS: 1,
  MAX_QUESTIONS: 500,
  MIN_DURATION_MINUTES: 1,
  MAX_DURATION_MINUTES: 1440,
  MIN_SCORE: 0,
  MAX_SCORE: 100000,
  MIN_PERCENTAGE: 0,
  MAX_PERCENTAGE: 100,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

/**
 * ------------------------------------------------------------
 * Attempt Sort Fields (Whitelisted for Query Safety)
 * ------------------------------------------------------------
 */
const ATTEMPT_SORT_FIELDS = Object.freeze([
  "startedAt",
  "expiresAt",
  "submittedAt",
  "attemptNumber",
  "status",
  "createdAt",
  "updatedAt",
]);

/**
 * ------------------------------------------------------------
 * Answer Submission Limits
 * ------------------------------------------------------------
 */
const ATTEMPT_ANSWER_LIMITS = Object.freeze({
  MAX_SELECTED_OPTIONS: 50,
  MAX_ANSWER_TEXT_LENGTH: 10000,
});

/**
 * ------------------------------------------------------------
 * Answer Submission Machine-Readable Error Codes
 * ------------------------------------------------------------
 */
const ATTEMPT_ANSWER_ERROR_CODES = Object.freeze({
  INVALID_ANSWER: "INVALID_ANSWER",
  QUESTION_NOT_FOUND: "ATTEMPT_QUESTION_NOT_FOUND",
  QUESTION_NOT_ACTIVE: "ATTEMPT_QUESTION_NOT_ACTIVE",
  INVALID_OPTION: "INVALID_OPTION",
  INVALID_OPTION_COUNT: "INVALID_OPTION_COUNT",
  ANSWER_TEXT_REQUIRED: "ANSWER_TEXT_REQUIRED",
  ANSWER_TEXT_NOT_ALLOWED: "ANSWER_TEXT_NOT_ALLOWED",
  ATTEMPT_NOT_ACTIVE: "ATTEMPT_NOT_ACTIVE",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
  INVITATION_INVALID: "INVITATION_INVALID",
});

/**
 * ------------------------------------------------------------
 * Question Evaluation Statuses
 * ------------------------------------------------------------
 */
const ATTEMPT_EVALUATION = Object.freeze({
  CORRECT: "CORRECT",
  INCORRECT: "INCORRECT",
  UNANSWERED: "UNANSWERED",
});

/**
 * ------------------------------------------------------------
 * Attempt Lifecycle State Machine Transition Matrix
 * ------------------------------------------------------------
 */
const ATTEMPT_TRANSITIONS = Object.freeze({
  [ATTEMPT_STATUS.IN_PROGRESS]: Object.freeze([
    ATTEMPT_STATUS.SUBMITTED,
    ATTEMPT_STATUS.EXPIRED,
    ATTEMPT_STATUS.CANCELLED,
  ]),
  [ATTEMPT_STATUS.SUBMITTED]: Object.freeze([]),
  [ATTEMPT_STATUS.EXPIRED]: Object.freeze([]),
  [ATTEMPT_STATUS.CANCELLED]: Object.freeze([]),
});

/**
 * Transition Helper: Validates outbound status transitions
 */
const isAttemptTransitionAllowed = (fromStatus, toStatus) => {
  const allowedTransitions = ATTEMPT_TRANSITIONS[fromStatus] || [];
  return allowedTransitions.includes(toStatus);
};

/**
 * Terminal Status Helper: Checks if status is irreversible
 */
const TERMINAL_ATTEMPT_STATUSES = Object.freeze([
  ATTEMPT_STATUS.SUBMITTED,
  ATTEMPT_STATUS.EXPIRED,
  ATTEMPT_STATUS.CANCELLED,
]);

const isTerminalAttemptStatus = (status) =>
  TERMINAL_ATTEMPT_STATUSES.includes(status);

const isAttemptTerminalStatus = isTerminalAttemptStatus;

/**
 * ------------------------------------------------------------
 * Attempt Success Messages
 * ------------------------------------------------------------
 */
const ATTEMPT_MESSAGES = Object.freeze({
  CREATED: "Assessment attempt started successfully.",
  FETCHED: "Assessment attempt retrieved successfully.",
  LIST_FETCHED: "Assessment attempts retrieved successfully.",
  ANSWER_SAVED: "Answer saved successfully.",
  ANSWERS_SAVED: "Answers saved successfully.",
  SUBMITTED: "Assessment attempt submitted successfully.",
  EXPIRED: "Assessment attempt has expired.",
  CANCELLED: "Assessment attempt cancelled successfully.",
  RESULT_FETCHED: "Assessment result retrieved successfully.",
});

/**
 * ------------------------------------------------------------
 * Attempt Machine-Readable Error Codes
 * ------------------------------------------------------------
 */
const ATTEMPT_ERRORS = Object.freeze({
  NOT_FOUND: "ASSESSMENT_ATTEMPT_NOT_FOUND",
  ASSESSMENT_NOT_FOUND: "ASSESSMENT_NOT_FOUND",
  QUESTION_NOT_FOUND: "ASSESSMENT_ATTEMPT_QUESTION_NOT_FOUND",
  ASSESSMENT_NOT_ACTIVE: "ASSESSMENT_NOT_ACTIVE",
  ASSESSMENT_NOT_AVAILABLE: "ASSESSMENT_NOT_AVAILABLE",
  CANDIDATE_NOT_ELIGIBLE: "CANDIDATE_NOT_ELIGIBLE",
  MAX_ATTEMPTS_REACHED: "MAX_ATTEMPTS_REACHED",
  ACTIVE_ATTEMPT_EXISTS: "ACTIVE_ATTEMPT_EXISTS",
  INVALID_ATTEMPT_NUMBER: "INVALID_ATTEMPT_NUMBER",
  INVALID_STATUS: "ASSESSMENT_ATTEMPT_INVALID_STATUS",
  ALREADY_SUBMITTED: "ASSESSMENT_ATTEMPT_ALREADY_SUBMITTED",
  ALREADY_EXPIRED: "ASSESSMENT_ATTEMPT_ALREADY_EXPIRED",
  ALREADY_CANCELLED: "ASSESSMENT_ATTEMPT_ALREADY_CANCELLED",
  CANNOT_SUBMIT: "ASSESSMENT_ATTEMPT_CANNOT_BE_SUBMITTED",
  CANNOT_CANCEL: "ASSESSMENT_ATTEMPT_CANNOT_BE_CANCELLED",
  ATTEMPT_EXPIRED: "ASSESSMENT_ATTEMPT_EXPIRED",
  INVALID_EXPIRY: "ASSESSMENT_ATTEMPT_INVALID_EXPIRY",
  ACCESS_DENIED: "ASSESSMENT_ATTEMPT_ACCESS_DENIED",
  OWNERSHIP_REQUIRED: "ASSESSMENT_ATTEMPT_OWNERSHIP_REQUIRED",
  INVALID_ANSWER: "INVALID_ASSESSMENT_ANSWER",
  QUESTION_NOT_IN_ATTEMPT: "QUESTION_NOT_IN_ATTEMPT",
  OPTION_NOT_IN_QUESTION: "OPTION_NOT_IN_QUESTION",
  INVALID_OPTION_COUNT: "INVALID_OPTION_COUNT",
  ANSWER_NOT_ALLOWED: "ANSWER_NOT_ALLOWED",
  EVALUATION_FAILED: "ASSESSMENT_EVALUATION_FAILED",
  SCORE_CALCULATION_FAILED: "ASSESSMENT_SCORE_CALCULATION_FAILED",
  CONCURRENT_MODIFICATION: "ASSESSMENT_ATTEMPT_CONCURRENT_MODIFICATION",
  INVALID_REQUEST: "INVALID_ASSESSMENT_ATTEMPT_REQUEST",
});

const ATTEMPT_ERROR_CODES = Object.freeze({
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
  ATTEMPT_NOT_ACTIVE: "ATTEMPT_NOT_ACTIVE",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
  ATTEMPT_SESSION_EXPIRED: "ATTEMPT_SESSION_EXPIRED",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_NOT_ACTIVE: "INVITATION_NOT_ACTIVE",
  ACTIVE_ATTEMPT_NOT_FOUND: "ACTIVE_ATTEMPT_NOT_FOUND",
});

const ATTEMPT_TOKEN_MIN_LENGTH = 32;
const ATTEMPT_TOKEN_MAX_LENGTH = 512;
const ATTEMPT_TOKEN_HASH_ALGORITHM = "sha256";

const ATTEMPT_SECURITY_ERRORS = Object.freeze({
  INVALID_TOKEN: "INVALID_ATTEMPT_TOKEN",
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
  ATTEMPT_ACCESS_DENIED: "ATTEMPT_ACCESS_DENIED",
  QUESTION_NOT_IN_ATTEMPT: "QUESTION_NOT_IN_ATTEMPT",
  ATTEMPT_NOT_ACTIVE: "ATTEMPT_NOT_ACTIVE",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
});

/**
 * ------------------------------------------------------------
 * Candidate Invitation Constants
 * ------------------------------------------------------------
 */
const INVITATION_TOKEN_PREFIX = "inv_";
const INVITATION_TOKEN_BYTES = 32;
const INVITATION_DEFAULT_EXPIRY_HOURS = 72;
const INVITATION_MAX_EXPIRY_HOURS = 168;

const INVITATION_STATUS = Object.freeze({
  PENDING: "PENDING",
  SENT: "SENT",
  OPENED: "OPENED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
});

const INVITATION_ERROR_CODES = Object.freeze({
  INVALID_TOKEN: "INVALID_INVITATION_TOKEN",
  TOKEN_EXPIRED: "INVITATION_TOKEN_EXPIRED",
  TOKEN_ALREADY_USED: "INVITATION_TOKEN_ALREADY_USED",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  DUPLICATE_INVITATION: "DUPLICATE_INVITATION",
  CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND",
  ASSESSMENT_NOT_FOUND: "ASSESSMENT_NOT_FOUND",
  ASSESSMENT_NOT_AVAILABLE: "ASSESSMENT_NOT_AVAILABLE",
});

const BULK_INVITATION_MAX_CANDIDATES = 500;

const BULK_INVITATION_RESULT_STATUS = Object.freeze({
  CREATED: "CREATED",
  DUPLICATE: "DUPLICATE",
  FAILED: "FAILED",
});

const BULK_INVITATION_ERROR_CODES = Object.freeze({
  EMPTY_CANDIDATES: "EMPTY_CANDIDATES",
  TOO_MANY_CANDIDATES: "TOO_MANY_CANDIDATES",
  DUPLICATE_CANDIDATE_IDS: "DUPLICATE_CANDIDATE_IDS",
  PARTIAL_FAILURE: "PARTIAL_INVITATION_FAILURE",
});

/**
 * ------------------------------------------------------------
 * Attempt Submission & Auto Evaluation Constants
 * ------------------------------------------------------------
 */
const ATTEMPT_SUBMISSION_LIMITS = Object.freeze({
  MIN_SCORE: 0,
  MAX_PERCENTAGE: 100,
});

const ATTEMPT_EVALUATION_STATUS = Object.freeze({
  CORRECT: "CORRECT",
  INCORRECT: "INCORRECT",
  UNANSWERED: "UNANSWERED",
});

const ATTEMPT_RESULT_STATUS = Object.freeze({
  PASSED: "PASSED",
  FAILED: "FAILED",
});

const ATTEMPT_SUBMIT_ERROR_CODES = Object.freeze({
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_EXPIRED: "INVITATION_EXPIRED",
  CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND",
  ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
  ATTEMPT_ALREADY_SUBMITTED: "ATTEMPT_ALREADY_SUBMITTED",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
  ATTEMPT_NOT_SUBMITTABLE: "ATTEMPT_NOT_SUBMITTABLE",
  ASSESSMENT_NOT_FOUND: "ASSESSMENT_NOT_FOUND",
  EVALUATION_FAILED: "EVALUATION_FAILED",
});

const ATTEMPT_RESULT_SORT_FIELDS = Object.freeze([
  "candidateName",
  "candidateEmail",
  "attemptNumber",
  "status",
  "score",
  "percentage",
  "submittedAt",
  "createdAt",
]);

const ATTEMPT_RESULT_SORT_ORDERS = Object.freeze([
  "asc",
  "desc",
]);

const ATTEMPT_RESULT_FILTER_STATUSES = Object.freeze([
  "IN_PROGRESS",
  "SUBMITTED",
  "EXPIRED",
  "CANCELLED",
]);

const ATTEMPT_RESULT_ERROR_CODES = Object.freeze({
  ASSESSMENT_NOT_FOUND:
    "ASSESSMENT_NOT_FOUND",

  ATTEMPT_NOT_FOUND:
    "ATTEMPT_NOT_FOUND",

  ACCESS_DENIED:
    "ACCESS_DENIED",

  INVALID_SORT_FIELD:
    "INVALID_SORT_FIELD",

  INVALID_SORT_ORDER:
    "INVALID_SORT_ORDER",

  RESULT_NOT_AVAILABLE:
    "RESULT_NOT_AVAILABLE",
});

/* ==========================================
 * OTP CONSTANTS
 * ========================================== */

const OTP_PURPOSE = Object.freeze({
  ASSESSMENT_VERIFICATION: "ASSESSMENT_VERIFICATION",
  LOGIN: "LOGIN",
  PASSWORD_RESET: "PASSWORD_RESET",
});

const OTP_CONFIG = Object.freeze({
  LENGTH: 6,
  EXPIRY_MINUTES: 5,
  MAX_ATTEMPTS: 3,
  RESEND_COOLDOWN_SECONDS: 60,
  MAX_REQUESTS_PER_HOUR: 5,
});

const OTP_ERROR_CODES = Object.freeze({
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_MAX_ATTEMPTS: "OTP_MAX_ATTEMPTS",
  OTP_NOT_FOUND: "OTP_NOT_FOUND",
  OTP_ALREADY_VERIFIED: "OTP_ALREADY_VERIFIED",
  OTP_COOLDOWN: "OTP_COOLDOWN",
  OTP_RATE_LIMITED: "OTP_RATE_LIMITED",
  OTP_SECRET_NOT_CONFIGURED: "OTP_SECRET_NOT_CONFIGURED",
});

/* ==========================================
 * OTP SECURITY HELPERS
 * ========================================== */

const generateNumericOtp = () => {
  const min = 100000;
  const max = 1000000;
  return crypto.randomInt(min, max).toString();
};

const hashOtp = (otp) => {
  const secret = process.env.OTP_SECRET;

  if (!secret) {
    throw new Error("OTP_SECRET environment variable is not configured.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(otp, "utf8")
    .digest("hex");
};

const verifyOtpHash = (otp, storedHash) => {
  const calculatedHash = hashOtp(otp);

  const calculatedBuffer = Buffer.from(calculatedHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (calculatedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedBuffer, storedBuffer);
};

const createOtpExpiryDate = (now = new Date()) => {
  return new Date(now.getTime() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);
};

const isOtpExpired = (expiresAt, now = new Date()) => {
  return now >= expiresAt;
};

const hasExceededOtpAttempts = (attemptsCount, maxAttempts = OTP_CONFIG.MAX_ATTEMPTS) => {
  return attemptsCount >= maxAttempts;
};

const isValidNumericOtp = (otp) => {
  return typeof otp === "string" && /^\d{6}$/.test(otp);
};

/* ==========================================
 * VERIFICATION SESSION CONSTANTS & HELPERS
 * ========================================== */

const VERIFICATION_SESSION_CONFIG = Object.freeze({
  TOKEN_BYTES: 32,
  DEFAULT_TTL_MINUTES: 15,
  MAX_TTL_MINUTES: 30,
  TOKEN_PREFIX: "vs_",
});

const VERIFICATION_SESSION_ERROR_CODES = Object.freeze({
  SESSION_NOT_FOUND: "VERIFICATION_SESSION_NOT_FOUND",
  SESSION_EXPIRED: "VERIFICATION_SESSION_EXPIRED",
  SESSION_REVOKED: "VERIFICATION_SESSION_REVOKED",
  INVALID_SESSION: "INVALID_VERIFICATION_SESSION",
});

const generateVerificationSessionToken = () => {
  return `${VERIFICATION_SESSION_CONFIG.TOKEN_PREFIX}${crypto.randomBytes(VERIFICATION_SESSION_CONFIG.TOKEN_BYTES).toString("hex")}`;
};

const hashVerificationSessionToken = (token) => {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Verification session token is required.");
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
};

const createVerificationSessionExpiryDate = (now = new Date()) => {
  return new Date(now.getTime() + VERIFICATION_SESSION_CONFIG.DEFAULT_TTL_MINUTES * 60 * 1000);
};

module.exports = {
  ATTEMPT_STATUS,
  ATTEMPT_LIMITS,
  ATTEMPT_SORT_FIELDS,
  ATTEMPT_ANSWER_LIMITS,
  ATTEMPT_ANSWER_ERROR_CODES,
  ATTEMPT_EVALUATION,
  ATTEMPT_TRANSITIONS,
  isAttemptTransitionAllowed,
  isAttemptTerminalStatus,
  ATTEMPT_MESSAGES,
  ATTEMPT_ERRORS,
  INVITATION_TOKEN_PREFIX,
  INVITATION_TOKEN_BYTES,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_STATUS,
  INVITATION_ERROR_CODES,
  BULK_INVITATION_MAX_CANDIDATES,
  BULK_INVITATION_RESULT_STATUS,
  BULK_INVITATION_ERROR_CODES,
  ATTEMPT_SUBMISSION_LIMITS,
  ATTEMPT_EVALUATION_STATUS,
  ATTEMPT_RESULT_STATUS,
  ATTEMPT_SUBMIT_ERROR_CODES,
  ATTEMPT_RESULT_SORT_FIELDS,
  ATTEMPT_RESULT_SORT_ORDERS,
  ATTEMPT_RESULT_FILTER_STATUSES,
  ATTEMPT_RESULT_ERROR_CODES,
  OTP_PURPOSE,
  OTP_CONFIG,
  OTP_ERROR_CODES,
  generateNumericOtp,
  hashOtp,
  verifyOtpHash,
  createOtpExpiryDate,
  isOtpExpired,
  hasExceededOtpAttempts,
  isValidNumericOtp,
  VERIFICATION_SESSION_CONFIG,
  VERIFICATION_SESSION_ERROR_CODES,
  generateVerificationSessionToken,
  hashVerificationSessionToken,
  createVerificationSessionExpiryDate,
  TERMINAL_ATTEMPT_STATUSES,
  isTerminalAttemptStatus,
  ATTEMPT_ERROR_CODES,
  ATTEMPT_TOKEN_MIN_LENGTH,
  ATTEMPT_TOKEN_MAX_LENGTH,
  ATTEMPT_TOKEN_HASH_ALGORITHM,
  ATTEMPT_SECURITY_ERRORS,
};
