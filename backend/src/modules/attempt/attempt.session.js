"use strict";

const crypto = require("node:crypto");
const { VERIFICATION_SESSION_CONFIG } = require("./attempt.constants");

const generateVerificationSessionToken = () => {
  return (
    VERIFICATION_SESSION_CONFIG.TOKEN_PREFIX +
    crypto.randomBytes(VERIFICATION_SESSION_CONFIG.TOKEN_BYTES).toString("hex")
  );
};

const hashVerificationSessionToken = (token) => {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new TypeError("Verification session token is required.");
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
};

module.exports = {
  generateVerificationSessionToken,
  hashVerificationSessionToken,
};
