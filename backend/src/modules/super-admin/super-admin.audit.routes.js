"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminAuditController = require("./super-admin.audit.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin Audit Logs Endpoint
 * Base Path: /api/v1/super-admin
 */
router.get(
  "/audit-logs",
  requireAuth,
  requireSuperAdmin,
  superAdminAuditController.listAuditLogs
);

module.exports = router;
