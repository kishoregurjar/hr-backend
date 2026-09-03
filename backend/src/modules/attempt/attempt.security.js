"use strict";

const crypto = require("node:crypto");

const {
  ATTEMPT_TOKEN_MIN_LENGTH,
  ATTEMPT_TOKEN_MAX_LENGTH,
  ATTEMPT_TOKEN_HASH_ALGORITHM,
} = require("./attempt.constants");

const DEFAULT_PEPPER = "hirequest_default_secure_attempt_token_pepper_32chars_min";

const getAttemptTokenPepper = () => {
  const pepper = process.env.ATTEMPT_TOKEN_PEPPER || DEFAULT_PEPPER;

  if (!pepper || pepper.length < 32) {
    throw new Error(
      "ATTEMPT_TOKEN_PEPPER must be configured and at least 32 characters long"
    );
  }

  return pepper;
};

const validateAttemptTokenFormat = (token) => {
  if (typeof token !== "string") {
    return false;
  }

  if (
    token.length < ATTEMPT_TOKEN_MIN_LENGTH ||
    token.length > ATTEMPT_TOKEN_MAX_LENGTH
  ) {
    return false;
  }

  return true;
};

const hashAttemptToken = (token) => {
  if (!validateAttemptTokenFormat(token)) {
    throw new Error("Invalid attempt token format");
  }

  const pepper = getAttemptTokenPepper();

  return crypto
    .createHmac(ATTEMPT_TOKEN_HASH_ALGORITHM, pepper)
    .update(token, "utf8")
    .digest("hex");
};

const generateAttemptToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const safeEqualStrings = (left, right) => {
  if (
    typeof left !== "string" ||
    typeof right !== "string"
  ) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = {
  getAttemptTokenPepper,
  validateAttemptTokenFormat,
  hashAttemptToken,
  generateAttemptToken,
  safeEqualStrings,
};
