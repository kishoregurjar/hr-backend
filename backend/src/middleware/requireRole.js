const { ForbiddenError, UnauthorizedError } = require("../common/errors");

/**
 * ==========================================================
 * Require Role Guard Middleware (RBAC)
 * ==========================================================
 * Enforces Role-Based Access Control on protected routes.
 * Placed directly at src/middleware/requireRole.js matching Clean Middleware Standard.
 * ==========================================================
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required.", "UNAUTHORIZED"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError("You do not have permission to access this resource.", "FORBIDDEN"));
    }

    return next();
  };
};

module.exports = requireRole;
