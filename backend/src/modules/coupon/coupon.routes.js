"use strict";

const express = require("express");
const router = express.Router();
const couponController = require("./coupon.controller");
const requireAuth = require("../../middleware/requireAuth");

/**
 * Public & Company Coupon Validation Endpoints
 * Base path: /api/v1/coupons
 */

// Public Available Offers on pricing page (unauthenticated)
router.get("/public", (req, res, next) => couponController.getPublicOffers(req, res, next));

// Validate coupon code (can be called by authenticated users or visitors during onboarding)
router.post("/validate", (req, res, next) => couponController.validate(req, res, next));

// Check recurring renewal coupon terms for the authenticated company
router.get("/recurring-renewal", requireAuth, (req, res, next) =>
  couponController.getRecurringRenewal(req, res, next)
);

module.exports = router;
