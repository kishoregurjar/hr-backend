"use strict";

const couponService = require("./coupon.service");
const {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} = require("./coupon.validator");

class CouponController {
  /**
   * Validates a coupon code during checkout or plan evaluation.
   * POST /api/v1/coupons/validate
   */
  async validate(req, res, next) {
    try {
      const parsed = validateCouponSchema.parse(req.body);
      const companyId = req.user?.companyId || req.body.companyId || null;

      const result = await couponService.validateCoupon({
        code: parsed.code,
        planCode: parsed.planCode,
        billingCycle: parsed.billingCycle,
        companyId,
        isRenewal: parsed.isRenewal,
      });

      return res.status(200).json({
        success: true,
        message: "Coupon validated successfully.",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieves recurring renewal discount terms for the authenticated company's subscription.
   * GET /api/v1/coupons/recurring-renewal
   */
  async getRecurringRenewal(req, res, next) {
    try {
      const companyId = req.user?.companyId;
      const { planCode, billingCycle } = req.query;

      const result = await couponService.getRecurringRenewalCouponForCompany({
        companyId,
        planCode,
        billingCycle,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieves active, eligible public coupons for display on the public pricing page.
   * GET /api/v1/coupons/public
   */
  async getPublicOffers(req, res, next) {
    try {
      const { planCode, billingCycle } = req.query;
      const offers = await couponService.getPublicOffers({ planCode, billingCycle });
      return res.status(200).json({
        success: true,
        data: { coupons: offers },
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // Super Admin Management Endpoints
  // ==========================================

  async getAll(req, res, next) {
    try {
      const result = await couponService.getAllCoupons(req.query);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getReportsSummary(req, res, next) {
    try {
      const summary = await couponService.getCouponReportingSummary();
      return res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const coupon = await couponService.getCouponById(req.params.id);
      return res.status(200).json({
        success: true,
        data: coupon,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const validated = createCouponSchema.parse(req.body);
      const coupon = await couponService.createCoupon(validated);
      return res.status(201).json({
        success: true,
        message: `Coupon "${coupon.code}" created successfully.`,
        data: coupon,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const validated = updateCouponSchema.parse(req.body);
      const updated = await couponService.updateCoupon(req.params.id, validated);
      return res.status(200).json({
        success: true,
        message: `Coupon "${updated.code}" updated successfully.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const { isActive } = req.body;
      const updated = await couponService.toggleCouponStatus(req.params.id, isActive);
      return res.status(200).json({
        success: true,
        message: `Coupon "${updated.code}" is now ${updated.isActive ? "active" : "inactive"}.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const result = await couponService.deleteCoupon(req.params.id);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CouponController();
