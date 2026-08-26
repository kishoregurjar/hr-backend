"use strict";

class AppError extends Error {
  constructor(
    message,
    {
      statusCode = 500,
      code = "INTERNAL_SERVER_ERROR",
      details = null,
      isOperational = true,
    } = {}
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(
      this,
      this.constructor
    );
  }
}

/**
 * HTTP 400 - Invalid Request
 */
const badRequest = (
  message = "Invalid request.",
  code = "BAD_REQUEST",
  details = null
) =>
  new AppError(message, {
    statusCode: 400,
    code,
    details,
  });

/**
 * HTTP 401 - Authentication Required / Invalid
 */
const unauthorized = (
  message = "Authentication is required.",
  code = "UNAUTHORIZED",
  details = null
) =>
  new AppError(message, {
    statusCode: 401,
    code,
    details,
  });

/**
 * HTTP 403 - Permission Denied
 */
const forbidden = (
  message = "You do not have permission to perform this action.",
  code = "FORBIDDEN",
  details = null
) =>
  new AppError(message, {
    statusCode: 403,
    code,
    details,
  });

/**
 * HTTP 404 - Resource Not Found
 */
const notFound = (
  message = "Resource not found.",
  code = "RESOURCE_NOT_FOUND",
  details = null
) =>
  new AppError(message, {
    statusCode: 404,
    code,
    details,
  });

/**
 * HTTP 409 - State / Conflict
 */
const conflict = (
  message = "Resource state conflict.",
  code = "CONFLICT",
  details = null
) =>
  new AppError(message, {
    statusCode: 409,
    code,
    details,
  });

/**
 * HTTP 422 - Semantically Invalid Input
 */
const unprocessableEntity = (
  message = "Semantically invalid input.",
  code = "VALIDATION_ERROR",
  details = null
) =>
  new AppError(message, {
    statusCode: 422,
    code,
    details,
  });

/**
 * HTTP 429 - Rate Limit
 */
const tooManyRequests = (
  message = "Too many requests.",
  code = "RATE_LIMIT_EXCEEDED",
  details = null
) =>
  new AppError(message, {
    statusCode: 429,
    code,
    details,
  });

/**
 * HTTP 500 - Unexpected Server Error
 */
const internalServerError = (
  message = "An unexpected server error occurred.",
  code = "INTERNAL_SERVER_ERROR",
  details = null
) =>
  new AppError(message, {
    statusCode: 500,
    code,
    details,
    isOperational: false,
  });

/**
 * HTTP 503 - Temporary Dependency / Service Unavailable
 */
const serviceUnavailable = (
  message = "Service is temporarily unavailable. Please try again later.",
  code = "SERVICE_UNAVAILABLE",
  details = null
) =>
  new AppError(message, {
    statusCode: 503,
    code,
    details,
    isOperational: true,
  });

module.exports = {
  AppError,
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
