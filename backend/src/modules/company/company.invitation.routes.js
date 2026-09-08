"use strict";

const express = require("express");
const companyInvitationController = require("./company.invitation.controller");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { companyContext } = require("./company.context.middleware");

const router = express.Router();

/**
 * Company invitation management (Requires company member)
 */

// Create invitation
router.post(
  "/me/invitations",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.createInvitation
);

// List invitations
router.get(
  "/me/invitations",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.listInvitations
);

// Revoke invitation
router.delete(
  "/me/invitations/:invitationId",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.revokeInvitation
);

/**
 * Invitation acceptance
 * Authentication is required to verify logged-in email matches invitation email.
 */
router.post(
  "/invitations/accept",
  requireAuth,
  companyInvitationController.acceptInvitation
);

module.exports = router;
