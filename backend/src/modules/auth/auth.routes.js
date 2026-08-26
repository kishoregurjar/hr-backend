const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("./auth.constants");

const controller = require("./auth.controller");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require("./auth.validator");

/**
 * ==========================================================
 * Auth Module Routes
 * ==========================================================
 * Base Path: /api/v1/auth
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */

router.post("/register", validateRequest(registerSchema), controller.register);
router.post("/login", validateRequest(loginSchema), controller.login);
router.post("/refresh-token", validateRequest(refreshTokenSchema), controller.refreshToken);
router.post("/logout", controller.logout);
router.post("/forgot-password", validateRequest(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validateRequest(resetPasswordSchema), controller.resetPassword);

// Protected Routes
router.use(requireAuth);
router.get("/me", controller.getCurrentUser);
router.post("/logout-all", controller.logoutAllDevices);
router.post("/change-password", validateRequest(changePasswordSchema), controller.changePassword);

module.exports = router;
