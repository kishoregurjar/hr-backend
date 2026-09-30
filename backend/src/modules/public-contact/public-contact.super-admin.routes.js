"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("../super-admin/super-admin.authorization");
const controller = require("./public-contact.controller");

/**
 * Super Admin middleware
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
 * Super Admin Public Contact Management Routes
 * Base Path: /api/v1/super-admin/contact-inquiries
 */

// Super Admin: List all public inquiries
router.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  controller.listAllInquiries
);

// Super Admin: Get a single public inquiry
router.get(
  "/:id",
  requireAuth,
  requireSuperAdmin,
  controller.getInquiryAdmin
);

// Super Admin: Update inquiry status
router.patch(
  "/:id/status",
  requireAuth,
  requireSuperAdmin,
  controller.updateStatus
);

// Super Admin: Reply to inquiry
router.post(
  "/:id/reply",
  requireAuth,
  requireSuperAdmin,
  controller.replyToInquiry
);

module.exports = router;
