"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const controller = require("./super-admin.owner-management.controller");
const superAdminCompanyController = require("./super-admin.company.controller");
const {
  ownerActivationResendAdminLimit,
  ownerActivationResendCompanyLimit,
} = require("../../middleware/rate-limit.middleware");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(requireAuth);
router.use(requireSuperAdmin);

// View company owner details
router.get("/:companyId/owner", controller.getCompanyOwner);

// Resend activation email to company owner
router.post(
  "/:companyId/owner/resend-activation",
  ownerActivationResendAdminLimit,
  ownerActivationResendCompanyLimit,
  superAdminCompanyController.resendActivation
);

// Revoke pending activation for company owner
router.post("/:companyId/owner/revoke-activation", controller.revokeOwnerActivation);

module.exports = router;
