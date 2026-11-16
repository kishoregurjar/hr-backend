"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { companyContext } = require("../company/company.context.middleware");
const { assertSuperAdmin } = require("../super-admin/super-admin.authorization");
const paymentController = require("./payment.controller");
const superAdminPaymentsController = require("../super-admin/super-admin.payments.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Razorpay Payment & Subscription Order Routes
 * Base Path: /api/v1/payments
 */

// Public webhook endpoint from Razorpay (signature verified against rawBody)
router.post("/webhook", paymentController.webhook);

// Public onboarding payment endpoints for new company registration
router.post("/onboarding-order", paymentController.createOnboardingOrder);
router.post("/onboarding-verify", paymentController.verifyOnboardingPayment);

// Super Admin platform revenue aliases
router.get("/super-admin/overview", requireAuth, requireSuperAdmin, superAdminPaymentsController.getOverview);
router.get("/super-admin/charts", requireAuth, requireSuperAdmin, superAdminPaymentsController.getCharts);
router.get("/super-admin/transactions", requireAuth, requireSuperAdmin, superAdminPaymentsController.getTransactions);
router.get("/super-admin/transactions/:id", requireAuth, requireSuperAdmin, superAdminPaymentsController.getTransactionDetail);

// Middleware to permit expired companies strictly for subscription renewal & payment verification
const allowExpiredPlan = (req, res, next) => {
  req.allowExpiredPlan = true;
  next();
};

// Strict Authorization: Only authenticated company OWNER is allowed to purchase or renew plans
const requireCompanyOwner = (req, res, next) => {
  const role = req.companyMember?.role;
  if (role !== "OWNER" && role !== "COMPANY_OWNER") {
    const error = new Error("Only the company owner can purchase or renew subscription plans.");
    error.statusCode = 403;
    error.code = "OWNER_ACTION_REQUIRED";
    return next(error);
  }
  next();
};

// Protected company routes (requires logged in tenant owner)
// Allow expired plans strictly for renewal/checkout order creation, verification, and invoice history
router.post("/order", allowExpiredPlan, requireAuth, companyContext, requireCompanyOwner, paymentController.createOrder);
router.post("/verify", allowExpiredPlan, requireAuth, companyContext, requireCompanyOwner, paymentController.verifyPayment);
router.get("/history", allowExpiredPlan, requireAuth, companyContext, paymentController.getHistory);

module.exports = router;
