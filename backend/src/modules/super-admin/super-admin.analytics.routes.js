"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const validateRequest = require("../../middleware/validate.middleware");
const { assertSuperAdmin } = require("./super-admin.authorization");
const { getAnalyticsSchema } = require("./super-admin.analytics.validator");
const controller = require("./super-admin.analytics.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(requireAuth);
router.use(requireSuperAdmin);

// Platform Analytics Metrics with Query Validation
router.get(
  "/analytics",
  validateRequest(getAnalyticsSchema),
  controller.getAnalytics
);

// Platform Analytics CSV Export
router.get(
  "/analytics/export/csv",
  validateRequest(getAnalyticsSchema),
  controller.exportCsv
);

// Platform Analytics PDF Export
router.get(
  "/analytics/export/pdf",
  validateRequest(getAnalyticsSchema),
  controller.exportPdf
);

module.exports = router;

