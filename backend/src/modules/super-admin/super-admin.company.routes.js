"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminCompanyController = require("./super-admin.company.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

const {
  ownerActivationResendAdminLimit,
  ownerActivationResendCompanyLimit,
} = require("../../middleware/rate-limit.middleware");

/**
 * Super Admin Company Onboarding Endpoints
 * Base Path: /api/v1/super-admin
 */
router.post(
  "/companies",
  requireAuth,
  requireSuperAdmin,
  superAdminCompanyController.createCompany
);

router.get(
  "/companies",
  requireAuth,
  requireSuperAdmin,
  superAdminCompanyController.listCompanies
);

router.get(
  "/companies/:companyId",
  requireAuth,
  requireSuperAdmin,
  superAdminCompanyController.getCompany
);

router.patch(
  "/companies/:companyId/status",
  requireAuth,
  requireSuperAdmin,
  superAdminCompanyController.updateCompanyStatus
);

router.post(
  "/companies/:companyId/owner/resend-activation",
  requireAuth,
  requireSuperAdmin,
  ownerActivationResendAdminLimit,
  ownerActivationResendCompanyLimit,
  superAdminCompanyController.resendActivation
);

module.exports = router;
