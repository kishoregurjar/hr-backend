"use strict";

const { AppError } = require("../utils/app-error");
const { handlePrismaError } = require("../utils/prisma-error");

const logError = (error, req) => {
  console.error({
    requestId: req?.id || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
    statusCode: error?.statusCode || 500,
    code: error?.code || "INTERNAL_SERVER_ERROR",
    message: error?.message || "An unexpected server error occurred.",
    stack: error?.stack || null,
  });
};

const normalizeError = (error) => {
  if (error instanceof AppError || error?.name === "AppError") {
    return error;
  }

  const prismaError = handlePrismaError(error);
  if (prismaError) {
    return prismaError;
  }

  // Handle Zod Schema Validation Errors
  if (error?.name === "ZodError" || (error?.issues && Array.isArray(error.issues))) {
    const issues = error.issues || error.errors || [];
    const details = issues.map((issue) => {
      const pathArr = issue.path || [];
      // Clean prefix if path starts with body, query, params, cookies
      let fieldPath = pathArr.length > 0 ? pathArr.join(".") : "body";
      if (fieldPath.startsWith("body.")) {
        fieldPath = fieldPath.substring(5);
      } else if (fieldPath.startsWith("query.")) {
        fieldPath = fieldPath.substring(6);
      } else if (fieldPath.startsWith("params.")) {
        fieldPath = fieldPath.substring(7);
      }
      return {
        field: fieldPath || "body",
        message: issue.message,
      };
    });

    return new AppError("Request validation failed.", {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      details,
      isOperational: true,
    });
  }

  // Handle JWT Authentication Errors
  if (error?.name === "JsonWebTokenError") {
    return new AppError("Invalid authentication token.", {
      statusCode: 401,
      code: "INVALID_TOKEN",
      details: null,
      isOperational: true,
    });
  }
  if (error?.name === "TokenExpiredError") {
    return new AppError("Authentication token has expired. Please login again.", {
      statusCode: 401,
      code: "TOKEN_EXPIRED",
      details: null,
      isOperational: true,
    });
  }

  const isProd = process.env.NODE_ENV === "production";

  return new AppError(
    isProd
      ? "An unexpected server error occurred."
      : error?.message || "An unexpected server error occurred.",
    {
      statusCode:
        error?.statusCode >= 400 && error?.statusCode < 600
          ? error.statusCode
          : 500,
      code: error?.code || error?.errorCode || "INTERNAL_SERVER_ERROR",
      details: isProd ? null : error?.details || null,
      isOperational: false,
    }
  );
};

const errorMiddleware = (error, req, res, _next) => {
  logError(error, req);

  const normalizedError = normalizeError(error);

  const requestId = req?.id || null;

  /*
   * Never expose internal stack traces
   * in production responses.
   */
  const response = {
    success: false,
    message: normalizedError.message,
    code: normalizedError.code || "INTERNAL_SERVER_ERROR",
    data: null,
    meta: {
      requestId,
    },
  };

  if (normalizedError.details) {
    response.details = normalizedError.details;
  }

  return res.status(normalizedError.statusCode || 500).json(response);
};

module.exports = errorMiddleware;
module.exports.errorMiddleware = errorMiddleware;
module.exports.normalizeError = normalizeError;
module.exports.logError = logError;