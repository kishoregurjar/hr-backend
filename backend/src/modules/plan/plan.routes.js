"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { companyContext } = require("../company/company.context.middleware");
const planController = require("./plan.controller");

/**
 * Public/Company Plans & Pricing Routes
 * Base Path: /api/v1/plans
 */
router.get("/", planController.listActivePlans);

// Public onboarding: Free 7-Day Demo Trial registration
router.post("/register-demo", planController.registerDemo);

module.exports = router;

