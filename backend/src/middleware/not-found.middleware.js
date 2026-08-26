"use strict";

const { notFound } = require("../utils/app-error");

const notFoundMiddleware = (req, res, next) => {
  next(
    notFound(
      `Route ${req.method} ${req.originalUrl} not found.`,
      "ROUTE_NOT_FOUND"
    )
  );
};

module.exports = notFoundMiddleware;
module.exports.notFoundMiddleware = notFoundMiddleware;
