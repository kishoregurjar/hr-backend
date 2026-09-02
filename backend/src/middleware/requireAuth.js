const { verifyAccessToken } = require("../modules/auth/auth.utils");
const authRepository = require("../modules/auth/auth.repository");
const { UnauthorizedError } = require("../common/errors");

/**
 * ==========================================================
 * Require Authentication Guard Middleware
 * ==========================================================
 * Verifies Bearer JWT Access Token and binds authenticated user to req.user.
 * Placed directly at src/middleware/requireAuth.js matching Clean Middleware Standard.
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

    const user = await authRepository.findUserById(payload.sub);
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
