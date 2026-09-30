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

// HR: List own support requests
router.get(
  "/my-requests",
  requireAuth,
  supportController.listMyRequests
);

// HR: Get a single support request (own only)
router.get(
  "/:requestId",
  requireAuth,
  supportController.getRequest
);

module.exports = router;
