"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminUserController = require("./super-admin.user.controller");
const { ownerActivationResendAdminLimit } = require("../../middleware/rate-limit.middleware");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin User Directory Endpoints
 * Base Path: /api/v1/super-admin
 */
router.get(
  "/users",
  requireAuth,
  requireSuperAdmin,
  superAdminUserController.listUsers
);

router.post(
  "/users/invite",
  requireAuth,
  requireSuperAdmin,
  ownerActivationResendAdminLimit,
  superAdminUserController.invitePlatformAdmin
);

router.post(
  "/users/:userId/resend-invitation",
  requireAuth,
  requireSuperAdmin,
  ownerActivationResendAdminLimit,
  superAdminUserController.resendPlatformAdminInvitation
);

module.exports = router;
