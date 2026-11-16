"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { companyContext } = require("../company/company.context.middleware");
const planController = require("./plan.controller");

/**
 * Company Subscription & Usage Management Routes
 * Base Path: /api/v1/subscriptions
 */

const allowExpiredPlan = (req, res, next) => {
  req.allowExpiredPlan = true;
  next();
};

// GET /current is allowed for expired companies so the billing/plans page can display current status & renewal options
router.get("/current", allowExpiredPlan, requireAuth, companyContext, planController.getCurrentSubscription);

// POST /demo/start strictly requires standard non-expired plan evaluation
router.post("/demo/start", requireAuth, companyContext, planController.startDemo);

module.exports = router;

