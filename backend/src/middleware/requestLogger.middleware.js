"use strict";

const pinoHttp = require("pino-http");
const logger = require("../config/logger");

const requestLogger = pinoHttp({
  logger,

  customLogLevel(req, res, error) {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },

  customErrorMessage(req, res) {
    return `${req.method} ${req.url} -> ${res.statusCode}`;
  },

  serializers: {
    req(req) {
      return {
        id: req.requestId || undefined,
        method: req.method,
        url: req.url,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

module.exports = requestLogger;