"use strict";

const { AppError } = require("./app-error");

const handlePrismaError = (error) => {
  if (!error) {
    return null;
  }

  // 1. Handle Prisma Database Connection & Initialization Errors
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
    console.error("[Prisma Connection Error]:", error.message);
    return new AppError("Database service is temporarily unavailable. Please try again shortly.", {
      statusCode: 503,
      code: "DATABASE_CONNECTION_ERROR",
      isOperational: true,
    });
  }

  // 2. Handle Known Prisma Error Codes First
  if (error.code) {
    console.error(`[Prisma Error ${error.code}]:`, error.message);

    switch (error.code) {
      case "P2002":
        return new AppError(
          "A resource with the same unique value already exists.",
          {
            statusCode: 409,
            code: "RESOURCE_ALREADY_EXISTS",
            isOperational: true,
          }
        );

      case "P2025":
        return new AppError(
          "The requested resource was not found.",
          {
            statusCode: 404,
            code: "RESOURCE_NOT_FOUND",
            isOperational: true,
          }
        );

      case "P2003":
        return new AppError(
          "The requested operation violates a related resource constraint.",
          {
            statusCode: 409,
            code: "RELATED_RESOURCE_CONSTRAINT",
            isOperational: true,
          }
        );

      case "P2014":
        return new AppError(
          "The requested operation violates a required relation.",
          {
            statusCode: 409,
            code: "RELATION_CONSTRAINT",
            isOperational: true,
          }
        );

      case "P2021":
        return new AppError(
          "The requested database table or relation does not exist in the database.",
          {
            statusCode: 500,
            code: "DATABASE_TABLE_NOT_FOUND",
            isOperational: true,
          }
        );

      case "P2022": {
        const col = error.meta?.column || error.meta?.column_name || "";
        const details = col ? ` (${col})` : (error.message ? `: ${error.message.split("\n")[0]}` : "");
        console.error(`[P2022 Missing Column]:`, col, error.meta, error.message);
        return new AppError(
          `A required database column does not exist in the database schema${details}.`,
          {
            statusCode: 500,
            code: "DATABASE_COLUMN_NOT_FOUND",
            isOperational: true,
          }
        );
      }

      default:
        // Other Prisma codes
        break;
    }
  }

  // 3. Handle PrismaClientValidationError (strict argument shape mismatch)
  if (error.name === "PrismaClientValidationError") {
    console.error("[PrismaClientValidationError]:", error.message);
    return new AppError("Database request validation failed. Please verify submitted fields.", {
      statusCode: 400,
      code: "INVALID_QUERY_ARGUMENT",
      isOperational: true,
    });
  }

  // 4. Handle Prisma Rust Engine Panic or Unknown Request Errors
  if (
    error.name === "PrismaClientRustPanicError" ||
    error.name === "PrismaClientUnknownRequestError"
  ) {
    console.error(`[${error.name}]:`, error.message);
    return new AppError("An unexpected database engine error occurred.", {
      statusCode: 500,
      code: "DATABASE_ENGINE_ERROR",
      isOperational: true,
    });
  }

  return null;
};

module.exports = {
  handlePrismaError,
};
