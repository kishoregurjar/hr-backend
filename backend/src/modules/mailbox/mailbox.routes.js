"use strict";

const express = require("express");
const controller = require("./mailbox.controller");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

/**
 * Public Callback endpoint (Google OAuth Redirects here with ?code=...&state=...)
 */
router.get("/google/callback", controller.handleGoogleCallback);

/**
 * Protected HR / SUPER_ADMIN Mailbox Endpoints
 */
router.get(
  "/google/connect",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  controller.connectGoogleMailbox
);

router.get(
  "/status",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  controller.getMailboxStatus
);

router.post(
  "/sync-now",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  controller.syncMailboxNow
);

router.post(
  "/",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  controller.syncMailboxNow
);

router.post(
  "/disconnect",
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  controller.disconnectMailbox
);

module.exports = router;
