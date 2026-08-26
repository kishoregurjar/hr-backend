const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../../config/env");
const { UnauthorizedError, BadRequestError } = require("../../common/errors");
const { TOKEN_TYPES, COOKIE_NAMES, AUTH_ERRORS } = require("./auth.constants");

const SALT_ROUNDS = env.security.bcryptSaltRounds;
const isProduction = env.app.environment === "production";

/**
 * ==========================================================
 * Enterprise Auth Utility Helper
 * ==========================================================
 * Consolidated helper for Password Hashing, JWT Signing & Verification,
 * Token Hashing (SHA-256), and HTTP-Only Cookie Management.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

// 1. Password Helpers
const hashPassword = async (password) => {
  if (!password) {
    throw new BadRequestError("Password is required for hashing.");
  }
  return bcrypt.hash(password, SALT_ROUNDS);
};

const comparePassword = async (plainPassword, hashedPassword) => {
  if (!plainPassword || !hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&^()_\-+=])[A-Za-z\d@$!%*?#&^()_\-+=]{8,64}$/;

const validatePasswordStrength = (password) => {
  if (!password || typeof password !== "string") {
    throw new BadRequestError("Password is required.");
  }
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestError(AUTH_ERRORS.INVALID_PASSWORD_FORMAT || "Invalid password format.");
  }
};

// 2. JWT Helpers
const JWT_OPTIONS = Object.freeze({
  issuer: env.app.name,
  audience: env.app.url,
});

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      type: TOKEN_TYPES.ACCESS,
    },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
      jwtid: crypto.randomUUID(),
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      tokenVersion: user.tokenVersion ?? 0,
      type: TOKEN_TYPES.REFRESH,
    },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
      jwtid: crypto.randomUUID(),
    }
  );
};

const verifyAccessToken = (token) => {
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret, {
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
    });
    if (payload.type !== TOKEN_TYPES.ACCESS) {
      throw new UnauthorizedError("Invalid token type.", "INVALID_TOKEN");
    }
    return payload;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new UnauthorizedError("Access token has expired.", "TOKEN_EXPIRED");
    }
    throw new UnauthorizedError("Invalid access token.", "INVALID_TOKEN");
  }
};

const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, env.jwt.refreshSecret, {
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
    });
    if (payload.type !== TOKEN_TYPES.REFRESH) {
      throw new UnauthorizedError("Invalid refresh token type.", "INVALID_TOKEN");
    }
    return payload;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new UnauthorizedError("Refresh token has expired.", "TOKEN_EXPIRED");
    }
    throw new UnauthorizedError("Invalid refresh token.", "INVALID_TOKEN");
  }
};

// 3. Crypto Token Hashing
const hashToken = (token) => {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex");
};

const compareToken = (plainToken, hashedToken) => {
  if (!plainToken || !hashedToken) return false;
  return hashToken(plainToken) === hashedToken;
};

// 4. Cookie Management
const DEFAULT_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
});

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    ...DEFAULT_COOKIE_OPTIONS,
    maxAge: env.cookie.refreshMaxAge,
  });
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, DEFAULT_COOKIE_OPTIONS);
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  compareToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
