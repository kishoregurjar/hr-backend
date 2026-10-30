"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const supportController = require("./support.controller");

/**
 * HR Support Request Routes
 * Base Path: /api/v1/support
 *
 * All routes require authentication via requireAuth middleware.
 */

// HR: Submit a new support request
router.post(
  "/",
  requireAuth,
  supportController.submitRequest
);

// HR: List own support requests (submitter view)
router.get(
  "/my-requests",
  requireAuth,
  supportController.listMyRequests
);

// Company Owner/Admin: List company support requests
router.get(
  "/company-requests",
  requireAuth,
  supportController.listCompanyRequests
);

// Company Owner/Admin or Super Admin: List company support requests
router.get(
  "/",
  requireAuth,
  supportController.listCompanyRequests
);

// Get a single support request (submitter, company owner/admin, or super admin)
router.get(
  "/:requestId",
  requireAuth,
  supportController.getRequest
);

// Update support request status (company owner/admin or super admin)
router.patch(
  "/:requestId/status",
  requireAuth,
  supportController.updateStatus
);

// Reply to support request (company owner/admin or super admin)
router.post(
  "/:requestId/reply",
  requireAuth,
  supportController.replyToRequest
);

module.exports = router;
