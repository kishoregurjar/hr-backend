"use strict";

const { AppError } = require("./app-error");

const handlePrismaError = (error) => {
  if (!error || !error.code) {
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
