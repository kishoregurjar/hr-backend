"use strict";

require("./test-env");

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../../src/config/env");

/**
 * Generate a valid access token matching the real auth.utils.js format.
 * issuer = env.app.name, audience = env.app.url
 */
function createAccessToken({ userId, email, role = "OWNER", tokenVersion = 0 } = {}) {
  if (!userId) throw new Error("userId is required");

  return jwt.sign(
    {
      sub: userId,
      email: email || "test@example.com",
      role,
      tokenVersion,
      type: "access",
    },
    env.jwt.accessSecret,
    {
      expiresIn: "15m",
      issuer: env.app.name,
      audience: env.app.url,
      jwtid: crypto.randomUUID(),
    }
  );
}

/**
 * Generate an expired access token (for 401 tests).
 */
function createExpiredAccessToken({ userId, role = "OWNER" } = {}) {
  return jwt.sign(
    {
      sub: userId,
      role,
      type: "access",
    },
    env.jwt.accessSecret,
    {
      expiresIn: "-1s",
      issuer: env.app.name,
      audience: env.app.url,
    }
  );
}

module.exports = {
  createAccessToken,
  createExpiredAccessToken,
};
