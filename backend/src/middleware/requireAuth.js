const { verifyAccessToken } = require("../modules/auth/auth.utils");
const authRepository = require("../modules/auth/auth.repository");
const { UnauthorizedError } = require("../common/errors");
const { AppError } = require("../utils/app-error");

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

const clearUserCache = (userId) => {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
};

/**
 * ==========================================================
 * Require Authentication Guard Middleware
 * ==========================================================
 * Verifies Bearer JWT Access Token and binds authenticated user to req.user.
 * Checks User status as well as Company suspension status for non-Super Admins.
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

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedError("Your account has been deactivated. Please contact your company owner for assistance.", "ACCOUNT_DEACTIVATED");
    }

    // Check Company Suspension for non-Super Admin users
    if (user.role !== "SUPER_ADMIN" && Array.isArray(user.companyMembers) && user.companyMembers.length > 0) {
      const requestedCompanyId =
        req.headers["x-company-id"] ||
        req.headers["X-Company-Id"] ||
        req.query?.companyId;

      let targetMembership = null;
      if (requestedCompanyId) {
        targetMembership = user.companyMembers.find((m) => m.companyId === requestedCompanyId);
      }
      if (!targetMembership) {
        targetMembership = user.companyMembers[0];
      }

      if (
        targetMembership?.company?.status === "SUSPENDED" ||
        user.companyMembers.every((m) => m.company?.status === "SUSPENDED")
      ) {
        throw new AppError("Your company account has been suspended. Please contact platform support.", {
          statusCode: 403,
          code: "COMPANY_SUSPENDED",
          isOperational: true,
        });
      }
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.clearUserCache = clearUserCache;
