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

// Create company (does not require companyContext, creates first company)
router.post(
  "/",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyController.createCompany
);

// Get current user's company
router.get(
  "/me",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.getMyCompany
);

// Update current user's company
router.patch(
  "/me",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.updateMyCompany
);

// Delete current user's company
router.delete(
  "/me",
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
  "/me/members",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.getMembers
);

// Add/invite company member
router.post(
  "/me/members",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.inviteMember
);

// Update company member role
router.patch(
  "/me/members/:memberId",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.updateMemberRole
);

// Remove company member
router.delete(
  "/me/members/:memberId",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.removeMember
);

/**
 * Company Ownership Transfer
 */
router.post(
  "/me/ownership/transfer",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.transferOwnership
);

/**
 * Company Audit Logs
 */
router.get(
  "/me/audit-logs",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyController.listAuditLogs
);

module.exports = router;
