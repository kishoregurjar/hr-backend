"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const couponController = require("../coupon/coupon.controller");

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

// Super Admin Coupon Management Endpoints
router.get("/coupons/reports/summary", (req, res, next) => couponController.getReportsSummary(req, res, next));
router.get("/coupons", (req, res, next) => couponController.getAll(req, res, next));
router.get("/coupons/:id", (req, res, next) => couponController.getById(req, res, next));
router.post("/coupons", (req, res, next) => couponController.create(req, res, next));
router.patch("/coupons/:id", (req, res, next) => couponController.update(req, res, next));
router.patch("/coupons/:id/status", (req, res, next) => couponController.toggleStatus(req, res, next));
router.delete("/coupons/:id", (req, res, next) => couponController.delete(req, res, next));

module.exports = router;
