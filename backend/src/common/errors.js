"use strict";

const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../utils/app-error");

/**
 * ==========================================================
 * Enterprise HTTP Exceptions Library
 * ==========================================================
 * Centralized, standardized operational exception classes for all API modules.
 * Placed directly at src/common/errors.js matching Clean Architecture.
 * ==========================================================
 */

/**
 * 400 Bad Request Exception
 */
class BadRequestError extends AppError {
  constructor(message = "Bad Request", errorCode = "BAD_REQUEST", details = null) {
    super(message, {
      statusCode: StatusCodes.BAD_REQUEST,
      code: errorCode,
      details,
    });
    this.name = "BadRequestError";
    this.errorCode = errorCode;
  }
}

/**
 * 401 Unauthorized Exception
 */
class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", errorCode = "UNAUTHORIZED", details = null) {
    super(message, {
      statusCode: StatusCodes.UNAUTHORIZED,
      code: errorCode,
      details,
    });
    this.name = "UnauthorizedError";
    this.errorCode = errorCode;
  }
}

/**
 * 403 Forbidden Exception
 */
class ForbiddenError extends AppError {
  constructor(message = "Forbidden", errorCode = "FORBIDDEN", details = null) {
    super(message, {
      statusCode: StatusCodes.FORBIDDEN,
      code: errorCode,
      details,
    });
    this.name = "ForbiddenError";
    this.errorCode = errorCode;
  }
}

/**
 * 404 Not Found Exception
 */
class NotFoundError extends AppError {
  constructor(message = "Resource not found", errorCode = "NOT_FOUND", details = null) {
    super(message, {
      statusCode: StatusCodes.NOT_FOUND,
      code: errorCode,
      details,
    });
    this.name = "NotFoundError";
    this.errorCode = errorCode;
  }
}

/**
 * 409 Conflict Exception
 */
class ConflictError extends AppError {
  constructor(message = "Resource conflict", errorCode = "CONFLICT", details = null) {
    super(message, {
      statusCode: StatusCodes.CONFLICT,
      code: errorCode,
      details,
    });
    this.name = "ConflictError";
    this.errorCode = errorCode;
  }
}

/**
 * 422 Unprocessable Entity / Validation Error Exception
 */
class ValidationError extends AppError {
  constructor(message = "Validation Error", details = null) {
    super(message, {
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
      code: "VALIDATION_ERROR",
      details,
    });
    this.name = "ValidationError";
    this.errorCode = "VALIDATION_ERROR";
  }
}

/**
 * 503 Service Unavailable Exception
 */
class ServiceUnavailableError extends AppError {
  constructor(message = "Service Unavailable", errorCode = "SERVICE_UNAVAILABLE", details = null) {
    super(message, {
      statusCode: StatusCodes.SERVICE_UNAVAILABLE,
      code: errorCode,
      details,
    });
    this.name = "ServiceUnavailableError";
    this.errorCode = errorCode;
  }
}

const {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessableEntity,
  tooManyRequests,
  internalServerError,
  serviceUnavailable,
} = require("../utils/app-error");

const ERROR_CODES = require("./error-codes");

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
  ERROR_CODES,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessableEntity,
  tooManyRequests,
  internalServerError,
  serviceUnavailable,
};
