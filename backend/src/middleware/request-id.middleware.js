"use strict";

const crypto = require("node:crypto");

const requestIdMiddleware = (req, res, next) => {
  const incomingId = req.get("X-Request-ID");

  const requestId =
    incomingId && /^[a-zA-Z0-9._:-]{1,128}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  next();
};

module.exports = {
  requestIdMiddleware,
};
