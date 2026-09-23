const { verifyAccessToken } = require("../modules/auth/auth.utils");
const authRepository = require("../modules/auth/auth.repository");
const { UnauthorizedError } = require("../common/errors");

const userCache = new Map();
const USER_CACHE_TTL = 60 * 1000; // 60 seconds

const getCachedUser = async (userId) => {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  const user = await authRepository.findUserById(userId);
  if (user) {
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL });
  }
  return user;
};

/**
 * ==========================================================
 * Require Authentication Guard Middleware
 * ==========================================================
 * Verifies Bearer JWT Access Token and binds authenticated user to req.user.
 * Placed directly at src/middleware/requireAuth.js matching Clean Middleware Standard.
 * Uses 60s in-memory cache to eliminate DB query latency on every request.
 * ==========================================================
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication token is required.", "TOKEN_REQUIRED");
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    const user = await getCachedUser(payload.sub);
    if (!user) {
      throw new UnauthorizedError("User no longer exists.", "USER_INVALID");
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = requireAuth;
