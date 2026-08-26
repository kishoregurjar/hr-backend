/**
 * ==========================================================
 * Standardized API Response Helper
 * ==========================================================
 * Standardizes successful HTTP responses across all modules.
 * Placed directly at src/common/response.js matching Clean Architecture.
 * ==========================================================
 */

class SuccessResponse {
  constructor({
    message = "Request completed successfully.",
    data = null,
    meta = null,
  } = {}) {
    this.success = true;
    this.message = message;
    this.data = data;
    this.meta = meta;
  }

  static send(res, options = {}, statusCode = 200) {
    const response = new SuccessResponse(options);
    return res.status(statusCode).json(response);
  }
}

class ErrorResponse {
  constructor({
    message = "An error occurred.",
    errorCode = "INTERNAL_SERVER_ERROR",
    details = null,
  } = {}) {
    this.success = false;
    this.error = {
      code: errorCode,
      message,
      details,
    };
  }

  static send(res, options = {}, statusCode = 500) {
    const response = new ErrorResponse(options);
    return res.status(statusCode).json(response);
  }
}

module.exports = {
  SuccessResponse,
  ErrorResponse,
};
