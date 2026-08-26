"use strict";

const crypto = require("node:crypto");

const hashValue = (value) =>
  crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

const buildRateLimitKey = ({ namespace, identifier }) => {
  return [
    "hirequest",
    "rate-limit",
    namespace,
    hashValue(identifier),
  ].join(":");
};

module.exports = {
  hashValue,
  normalizeEmail,
  buildRateLimitKey,
};
