const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("./auth.constants");
const { uploadAvatarMiddleware } = require("./auth.avatar.middleware");

const controller = require("./auth.controller");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} = require("./auth.validator");

/**
 * ==========================================================
 * Auth Module Routes
 * ==========================================================
 * Base Path: /api/v1/auth
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */

const {
  ownerActivationRateLimit,
  ownerActivationTokenLimit,
} = require("../../middleware/rate-limit.middleware");

router.post("/register", validateRequest(registerSchema), controller.register);
router.post("/login", validateRequest(loginSchema), controller.login);
router.post("/refresh-token", validateRequest(refreshTokenSchema), controller.refreshToken);
router.post("/logout", controller.logout);
router.post("/forgot-password", validateRequest(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validateRequest(resetPasswordSchema), controller.resetPassword);
router.post(
  "/owner/activate",
  ownerActivationRateLimit,
  ownerActivationTokenLimit,
  controller.activateOwner
);
router.get("/owner/activate/verify", controller.verifyOwnerActivation);
router.post("/exchange-ticket/consume", controller.consumeExchangeTicket);

// Protected Routes
router.use(requireAuth);
router.get("/me", controller.getCurrentUser);
router.patch("/me", validateRequest(updateProfileSchema), controller.updateProfile);
router.patch("/profile", validateRequest(updateProfileSchema), controller.updateProfile);
router.post("/me/avatar", uploadAvatarMiddleware, controller.uploadAvatar);
router.delete("/me/avatar", controller.removeAvatar);
router.post("/avatar", uploadAvatarMiddleware, controller.uploadAvatar);
router.delete("/avatar", controller.removeAvatar);
router.get("/me/companies", controller.getUserCompanies);
router.post("/logout-all", controller.logoutAllDevices);
router.post("/change-password", validateRequest(changePasswordSchema), controller.changePassword);
router.post("/exchange-ticket", controller.createExchangeTicket);

module.exports = router;
