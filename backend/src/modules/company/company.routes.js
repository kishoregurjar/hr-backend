"use strict";

const express = require("express");
const companyController = require("./company.controller");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { companyContext } = require("./company.context.middleware");

const router = express.Router();

/**
 * Company Profile Routes (/api/v1/companies)
 */

// Public company creation disabled (Company onboarding is managed by Platform Super Admin at POST /api/v1/super-admin/companies)
router.post("/", (req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      code: "PUBLIC_COMPANY_CREATION_DISABLED",
      message:
        "Public company creation is disabled. Company onboarding must be managed by Platform Super Admin at /api/v1/super-admin/companies.",
    },
  });
});

// Get current user's company
router.get(
  ["/me", "/"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.getMyCompany
);

// Update current user's company
router.patch(
  ["/me", "/"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.updateMyCompany
);

// Delete current user's company
router.delete(
  ["/me", "/"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.deleteCompany
);

/**
 * Company Team Routes (/api/v1/companies/me/members)
 */

// Get company members
router.get(
  ["/me/members", "/members"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.getMembers
);

// Add/invite company member
router.post(
  ["/me/members", "/members"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.inviteMember
);

// Update company member role
router.patch(
  ["/me/members/:memberId", "/members/:memberId"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.updateMemberRole
);

// Remove company member
router.delete(
  ["/me/members/:memberId", "/members/:memberId"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.removeMember
);

/**
 * Company Ownership Transfer
 */
router.post(
  ["/me/ownership/transfer", "/ownership/transfer"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.transferOwnership
);

/**
 * Company Audit Logs
 */
router.get(
  ["/me/audit-logs", "/audit-logs"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.listAuditLogs
);

module.exports = router;
