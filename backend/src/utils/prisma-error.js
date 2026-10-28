"use strict";

const { AppError } = require("./app-error");

const handlePrismaError = (error) => {
  if (!error) {
    return null;
  }

  // Handle Prisma Database Connection & Initialization Errors
  if (
    error.name === "PrismaClientInitializationError" ||
    error.code === "P1000" ||
    error.code === "P1001" ||
    error.code === "P1002" ||
    error.code === "P1003" ||
    error.code === "P1017" ||
    (typeof error.message === "string" && (
      error.message.includes("Can't reach database server") ||
      error.message.includes("Error querying the database") ||
      error.message.includes("FATAL: (ENOTFOUND)") ||
      error.message.includes("tenant/user")
    ))
  ) {
    return new AppError("Database service is temporarily unavailable. Please try again shortly.", {
      statusCode: 503,
      code: "DATABASE_CONNECTION_ERROR",
      isOperational: true,
    });
  }

  // Handle PrismaClientValidationError / Raw Query Dumps
  if (
    error.name === "PrismaClientValidationError" ||
    error.name === "PrismaClientUnknownRequestError" ||
    error.name === "PrismaClientRustPanicError" ||
    (typeof error.message === "string" && (
      error.message.includes("Invalid `db.") ||
      error.message.includes("Invalid `client.") ||
      error.message.includes("invocation in")
    ))
  ) {
    return new AppError("Database request validation failed. Please verify submitted fields.", {
      statusCode: 400,
      code: "INVALID_QUERY_ARGUMENT",
      isOperational: true,
    });
  }

  if (!error.code) {
    return null;
  }

  switch (error.code) {
    case "P2002":
      return new AppError(
        "A resource with the same unique value already exists.",
        {
          statusCode: 409,
          code: "RESOURCE_ALREADY_EXISTS",
        }
      );

    case "P2025":
      return new AppError(
        "The requested resource was not found.",
        {
          statusCode: 404,
          code: "RESOURCE_NOT_FOUND",
        }
      );

    case "P2003":
      return new AppError(
        "The requested operation violates a related resource constraint.",
        {
          statusCode: 409,
          code: "RELATED_RESOURCE_CONSTRAINT",
        }
      );

    case "P2014":
      return new AppError(
        "The requested operation violates a required relation.",
        {
          statusCode: 409,
          code: "RELATION_CONSTRAINT",
        }
      );

    default:
      return null;
  }
};

module.exports = {
  handlePrismaError,
};
