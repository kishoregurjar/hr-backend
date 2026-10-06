"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");
const { companyContext } = require("../company/company.context.middleware");
const dashboardController = require("./dashboard.controller");

/**
 * Aggregated Dashboard Overview Endpoint
 * GET /api/v1/dashboard/overview
 * Protected for HR and SUPER_ADMIN
 */
router.get(
  "/overview",
  requireAuth,
  companyContext,
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  dashboardController.getOverview
);

module.exports = router;
