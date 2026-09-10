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
  ["/me/invitations", "/invitations"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.createInvitation
);

// List invitations
router.get(
  ["/me/invitations", "/invitations"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.listInvitations
);

// Revoke invitation
router.delete(
  ["/me/invitations/:invitationId", "/invitations/:invitationId"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  companyInvitationController.revokeInvitation
);

/**
 * Invitation verification & acceptance
 * Verification is public so frontend can display invitation details before acceptance.
 * Authentication is required for accept to verify logged-in email matches invitation email.
 */
router.get(
  ["/invitations/verify", "/invitations/verify-token"],
  companyInvitationController.verifyInvitationToken
);

router.post(
  ["/invitations/accept-and-register", "/invitations/accept-register"],
  companyInvitationController.acceptAndRegisterInvitation
);

router.post(
  ["/invitations/accept", "/me/invitations/accept"],
  requireAuth,
  companyInvitationController.acceptInvitation
);

module.exports = router;
