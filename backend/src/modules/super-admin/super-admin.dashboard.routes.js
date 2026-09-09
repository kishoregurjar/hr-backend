"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const controller = require("./super-admin.dashboard.controller");

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

// Platform Statistics
router.get("/dashboard", controller.getDashboard);

// Company Statistics (supports both /dashboard/companies/:companyId/statistics and /companies/:companyId/statistics)
router.get(
  "/dashboard/companies/:companyId/statistics",
  controller.getCompanyStatistics
);
router.get(
  "/companies/:companyId/statistics",
  controller.getCompanyStatistics
);

module.exports = router;
