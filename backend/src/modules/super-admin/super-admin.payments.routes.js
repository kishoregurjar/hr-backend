"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminPaymentsController = require("./super-admin.payments.controller");

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

router.get("/payments/overview", superAdminPaymentsController.getOverview);
router.get("/payments/charts", superAdminPaymentsController.getCharts);
router.get("/payments/transactions", superAdminPaymentsController.getTransactions);
router.get("/payments/transactions/:id", superAdminPaymentsController.getTransactionDetail);

module.exports = router;

