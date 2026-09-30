"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("../super-admin/super-admin.authorization");
const supportController = require("./support.controller");

/**
 * Super Admin middleware — validates Super Admin role after requireAuth.
 */
const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin Support Management Routes
 * Base Path: /api/v1/super-admin/support
 */

// Super Admin: List all support requests
router.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  supportController.listAllRequests
);

// Super Admin: Get a single support request
router.get(
  "/:requestId",
  requireAuth,
  requireSuperAdmin,
  supportController.getRequestAdmin
);

// Super Admin: Update a support request's status
router.patch(
  "/:requestId/status",
  requireAuth,
  requireSuperAdmin,
  supportController.updateStatus
);

// Super Admin: Reply to a support request
router.post(
  "/:requestId/reply",
  requireAuth,
  requireSuperAdmin,
  supportController.replyToRequest
);

module.exports = router;
