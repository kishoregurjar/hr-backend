"use strict";

const { prisma } = require("../../config/prisma");
const { AppError } = require("../../utils/app-error");
const {
  COUPON_DISCOUNT_TYPE,
  COUPON_APPLICABILITY,
  COUPON_REDEMPTION_TYPE,
  COUPON_ERROR_CODES,
} = require("./coupon.constants");

class CouponService {
  /**
   * Validates a coupon code against plan, billing cycle, company history, and applicability rules.
   * Calculates exact discount and payable amounts server-side.
   */
  async validateCoupon({
    code,
    planCode,
    billingCycle = "MONTHLY",
    companyId = null,
    isRenewal = false,
    tx = prisma,
  }) {
    if (!code || typeof code !== "string") {
      throw new AppError("Coupon code is required.", {
        statusCode: 400,
        code: COUPON_ERROR_CODES.COUPON_NOT_FOUND,
        isOperational: true,
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedPlan = (planCode || "").trim().toUpperCase();
    const normalizedCycle = (billingCycle || "MONTHLY").trim().toUpperCase();
    const now = new Date();

    // 1. Fetch Coupon record
    let coupon = null;
    try {
      if (tx.coupon) {
        coupon = await tx.coupon.findUnique({
          where: { code: normalizedCode },
        });
      }
    } catch (dbErr) {
      console.warn("[CouponService] Coupon query fallback:", dbErr.message);
    }

    if (!coupon) {
      throw new AppError(`Coupon code "${normalizedCode}" was not found.`, {
        statusCode: 404,
        code: COUPON_ERROR_CODES.COUPON_NOT_FOUND,
        isOperational: true,
      });
    }

    // 2. Active status check
    if (!coupon.isActive) {
      throw new AppError(`Coupon "${normalizedCode}" is currently inactive.`, {
        statusCode: 400,
        code: COUPON_ERROR_CODES.COUPON_INACTIVE,
        isOperational: true,
      });
    }

    // 3. Validity Date range check
    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      throw new AppError(`Coupon "${normalizedCode}" is not yet active.`, {
        statusCode: 400,
        code: COUPON_ERROR_CODES.COUPON_NOT_STARTED,
        isOperational: true,
      });
    }

    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      throw new AppError(`Coupon "${normalizedCode}" has expired.`, {
        statusCode: 400,
        code: COUPON_ERROR_CODES.COUPON_EXPIRED,
        isOperational: true,
      });
    }

    // 4. Global redemption capacity check
    if (
      coupon.maxRedemptions !== null &&
      coupon.maxRedemptions !== undefined &&
      coupon.redemptionCount >= coupon.maxRedemptions
    ) {
      throw new AppError(
        `Coupon "${normalizedCode}" has reached its maximum total redemption limit.`,
        {
          statusCode: 400,
          code: COUPON_ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED,
          isOperational: true,
        }
      );
    }

    // 5. Per-company redemption limit check
    if (companyId && coupon.perCompanyLimit) {
      try {
        if (tx.couponRedemption) {
          const companyRedemptions = await tx.couponRedemption.count({
            where: {
              couponId: coupon.id,
              companyId,
            },
          });

          if (companyRedemptions >= coupon.perCompanyLimit) {
            throw new AppError(
              `You have already reached the redemption limit (${coupon.perCompanyLimit}) for coupon "${normalizedCode}".`,
              {
                statusCode: 400,
                code: COUPON_ERROR_CODES.COUPON_COMPANY_LIMIT_EXCEEDED,
                isOperational: true,
              }
            );
          }
        }
      } catch (countErr) {
        if (countErr instanceof AppError) throw countErr;
      }
    }

    // 6. Plan eligibility check
    if (
      Array.isArray(coupon.applicablePlans) &&
      coupon.applicablePlans.length > 0 &&
      !coupon.applicablePlans.includes(normalizedPlan)
    ) {
      throw new AppError(
        `Coupon "${normalizedCode}" is not valid for the ${normalizedPlan} plan. Applicable plans: ${coupon.applicablePlans.join(", ")}.`,
        {
          statusCode: 400,
          code: COUPON_ERROR_CODES.COUPON_NOT_APPLICABLE_PLAN,
          isOperational: true,
        }
      );
    }

    // 7. Billing cycle eligibility check
    if (
      Array.isArray(coupon.applicableCycles) &&
      coupon.applicableCycles.length > 0 &&
      !coupon.applicableCycles.includes(normalizedCycle)
    ) {
      throw new AppError(
        `Coupon "${normalizedCode}" is not valid for ${normalizedCycle} billing.`,
        {
          statusCode: 400,
          code: COUPON_ERROR_CODES.COUPON_NOT_APPLICABLE_CYCLE,
          isOperational: true,
        }
      );
    }

    // 8. Applicability Check: FIRST_PURCHASE vs EVERY_RENEWAL
    if (coupon.applicability === COUPON_APPLICABILITY.FIRST_PURCHASE) {
      if (isRenewal) {
        throw new AppError(
          `Coupon "${normalizedCode}" is valid only for first-time subscription purchases, not renewals.`,
          {
            statusCode: 400,
            code: COUPON_ERROR_CODES.COUPON_FIRST_PURCHASE_ONLY,
            isOperational: true,
          }
        );
      }

      if (companyId) {
        // Check if company has any prior completed paid payments
        try {
          const priorPaidCount = await tx.payment.count({
            where: {
              companyId,
              status: "COMPLETED",
              amount: { gt: 0 },
            },
          });

          if (priorPaidCount > 0) {
            throw new AppError(
              `Coupon "${normalizedCode}" is only applicable to your organization's first paid subscription purchase.`,
              {
                statusCode: 400,
                code: COUPON_ERROR_CODES.COUPON_FIRST_PURCHASE_ONLY,
                isOperational: true,
              }
            );
          }
        } catch (payCheckErr) {
          if (payCheckErr instanceof AppError) throw payCheckErr;
        }
      }
    }

    // 9. Fetch plan base amount to calculate discount
    let baseAmount = 0;
    try {
      const plan = await tx.plan.findFirst({
        where: { code: normalizedPlan, isActive: true },
      });
      if (plan) {
        baseAmount =
          normalizedCycle === "YEARLY"
            ? Number(plan.yearlyPrice)
            : Number(plan.monthlyPrice);
      }
    } catch (_) {}

    // Fallback prices if plan not found in DB
    if (!baseAmount) {
      const planDefaults = {
        STARTER: normalizedCycle === "YEARLY" ? 4990 : 499,
        GROWTH: normalizedCycle === "YEARLY" ? 9990 : 999,
        BUSINESS: normalizedCycle === "YEARLY" ? 24990 : 2499,
      };
      baseAmount = planDefaults[normalizedPlan] || 499;
    }

    // 10. Server-side discount calculation
    const discountVal = Number(coupon.discountValue);
    const maxDiscount =
      coupon.maxDiscountAmount !== null && coupon.maxDiscountAmount !== undefined
        ? Number(coupon.maxDiscountAmount)
        : null;

    let discountAmount = 0;
    if (coupon.discountType === COUPON_DISCOUNT_TYPE.PERCENTAGE) {
      const calculatedPct = (baseAmount * discountVal) / 100;
      discountAmount =
        maxDiscount !== null ? Math.min(calculatedPct, maxDiscount) : calculatedPct;
    } else {
      // Fixed discount
      discountAmount = Math.min(discountVal, baseAmount);
    }

    // Round discount to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;
    const finalAmount = Math.max(0, Math.round((baseAmount - discountAmount) * 100) / 100);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType,
        discountValue: discountVal,
        maxDiscountAmount: maxDiscount,
        applicability: coupon.applicability,
        applicablePlans: coupon.applicablePlans,
        applicableCycles: coupon.applicableCycles,
        validUntil: coupon.validUntil,
      },
      originalAmount: baseAmount,
      discountAmount,
      finalAmount,
      currency: "INR",
      applicability: coupon.applicability,
      isRenewal,
    };
  }

  /**
   * Retrieves and validates the recurring renewal coupon associated with a company's active subscription.
   * If valid, applies the discount; if expired or limit reached, returns normal plan price.
   */
  async getRecurringRenewalCouponForCompany({
    companyId,
    planCode,
    billingCycle = "MONTHLY",
    tx = prisma,
  }) {
    if (!companyId) return { hasRecurringCoupon: false };

    try {
      const subscription = await tx.subscription.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      if (!subscription) return { hasRecurringCoupon: false };

      const couponId = subscription.couponId;
      const couponCode = subscription.couponCode;

      if (!couponId && !couponCode) {
        return { hasRecurringCoupon: false };
      }

      // Try validating the associated recurring coupon
      try {
        const validation = await this.validateCoupon({
          code: couponCode || couponId,
          planCode: planCode || subscription.planCode,
          billingCycle: billingCycle || subscription.billingCycle,
          companyId,
          isRenewal: true,
          tx,
        });

        // Ensure it has EVERY_RENEWAL applicability
        if (validation.coupon.applicability === COUPON_APPLICABILITY.EVERY_RENEWAL) {
          return {
            hasRecurringCoupon: true,
            coupon: validation.coupon,
            originalAmount: validation.originalAmount,
            discountAmount: validation.discountAmount,
            finalAmount: validation.finalAmount,
            currency: validation.currency,
          };
        }

        return {
          hasRecurringCoupon: false,
          reason: "Associated coupon is first-purchase only, does not apply to renewals.",
          fallbackToNormalPrice: true,
        };
      } catch (valErr) {
        // Coupon expired, inactive, or limit reached -> Renew at normal price
        return {
          hasRecurringCoupon: false,
          reason: valErr.message,
          fallbackToNormalPrice: true,
        };
      }
    } catch (err) {
      console.warn("[getRecurringRenewalCouponForCompany] Warning:", err.message);
      return { hasRecurringCoupon: false };
    }
  }

  /**
   * Records a successful coupon redemption atomically upon payment confirmation.
   * Increments the coupon's redemption count and creates an audit record.
   */
  async recordCouponRedemption({
    couponId,
    companyId,
    paymentId,
    subscriptionId,
    originalAmount,
    discountAmount,
    finalAmount,
    currency = "INR",
    redemptionType = COUPON_REDEMPTION_TYPE.FIRST_PURCHASE,
    tx = prisma,
  }) {
    if (!couponId || !companyId) return null;

    try {
      // 1. Atomically increment redemption count
      if (tx.coupon) {
        await tx.coupon.update({
          where: { id: couponId },
          data: {
            redemptionCount: { increment: 1 },
          },
        });
      }

      // 2. Create CouponRedemption audit record
      if (tx.couponRedemption) {
        const redemption = await tx.couponRedemption.create({
          data: {
            couponId,
            companyId,
            paymentId: paymentId || null,
            subscriptionId: subscriptionId || null,
            redemptionType,
            originalAmount,
            discountAmount,
            finalAmount,
            currency,
          },
        });
        return redemption;
      }
    } catch (err) {
      console.warn("[recordCouponRedemption] Warning:", err.message);
    }
    return null;
  }

  // ==========================================
  // Super Admin Management Operations
  // ==========================================

  async getAllCoupons({
    search,
    applicability,
    isActive,
    showOnPricingPage,
    page = 1,
    limit = 20,
    tx = prisma,
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = {};

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (applicability) {
      where.applicability = applicability.toUpperCase();
    }

    if (isActive !== undefined && isActive !== null && isActive !== "") {
      where.isActive = String(isActive) === "true";
    }

    if (showOnPricingPage !== undefined && showOnPricingPage !== null && showOnPricingPage !== "") {
      where.showOnPricingPage = String(showOnPricingPage) === "true";
    }

    try {
      if (!tx.coupon) return { coupons: [], total: 0, page: pageNum, totalPages: 0 };

      const [coupons, total] = await Promise.all([
        tx.coupon.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
          include: {
            redemptions: {
              select: {
                id: true,
                redemptionType: true,
                discountAmount: true,
                finalAmount: true,
              },
            },
            _count: {
              select: {
                redemptions: true,
                subscriptions: true,
              },
            },
          },
        }),
        tx.coupon.count({ where }),
      ]);

      const now = new Date();

      const formatted = coupons.map((c) => {
        const redemptions = c.redemptions || [];
        const firstPurchaseRedemptions = redemptions.filter(
          (r) => r.redemptionType === COUPON_REDEMPTION_TYPE.FIRST_PURCHASE
        ).length;
        const renewalRedemptions = redemptions.filter(
          (r) => r.redemptionType === COUPON_REDEMPTION_TYPE.RENEWAL
        ).length;
        const totalDiscountGranted = redemptions.reduce(
          (sum, r) => sum + Number(r.discountAmount || 0),
          0
        );
        const totalRevenueCollected = redemptions.reduce(
          (sum, r) => sum + Number(r.finalAmount || 0),
          0
        );

        let computedStatus = "ACTIVE";
        if (!c.isActive) {
          computedStatus = "DISABLED";
        } else if (c.validUntil && new Date(c.validUntil) < now) {
          computedStatus = "EXPIRED";
        } else if (c.validFrom && new Date(c.validFrom) > now) {
          computedStatus = "SCHEDULED";
        } else if (
          c.maxRedemptions !== null &&
          c.maxRedemptions !== undefined &&
          c.redemptionCount >= c.maxRedemptions
        ) {
          computedStatus = "LIMIT_REACHED";
        }

        const remainingCapacity =
          c.maxRedemptions !== null && c.maxRedemptions !== undefined
            ? Math.max(0, c.maxRedemptions - c.redemptionCount)
            : null;

        return {
          id: c.id,
          code: c.code,
          name: c.name,
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          maxDiscountAmount: c.maxDiscountAmount ? Number(c.maxDiscountAmount) : null,
          applicability: c.applicability,
          applicablePlans: c.applicablePlans,
          applicableCycles: c.applicableCycles,
          validFrom: c.validFrom,
          validUntil: c.validUntil,
          maxRedemptions: c.maxRedemptions,
          perCompanyLimit: c.perCompanyLimit,
          redemptionCount: c.redemptionCount,
          remainingCapacity,
          computedStatus,
          isActive: c.isActive,
          showOnPricingPage: Boolean(c.showOnPricingPage),
          publicDescription: c.publicDescription || null,
          displayPriority: c.displayPriority ?? 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          totalRedemptions: c._count?.redemptions ?? c.redemptionCount,
          firstPurchaseRedemptions,
          renewalRedemptions,
          totalDiscountGranted: Math.round(totalDiscountGranted * 100) / 100,
          totalRevenueCollected: Math.round(totalRevenueCollected * 100) / 100,
          activeSubscriptionsCount: c._count?.subscriptions ?? 0,
        };
      });

      return {
        coupons: formatted,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    } catch (err) {
      console.warn("[getAllCoupons] Database query fallback:", err.message);
      return { coupons: [], total: 0, page: pageNum, totalPages: 0 };
    }
  }

  async getCouponById(id, tx = prisma) {
    if (!id) throw new AppError("Coupon ID is required.", { statusCode: 400 });

    try {
      if (!tx.coupon) throw new AppError("Coupon table not available.", { statusCode: 404 });

      const coupon = await tx.coupon.findUnique({
        where: { id },
        include: {
          redemptions: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              company: { select: { id: true, name: true, slug: true } },
              payment: { select: { id: true, status: true, razorpayPaymentId: true, billingCycle: true } },
            },
          },
          _count: {
            select: {
              redemptions: true,
              subscriptions: true,
            },
          },
        },
      });

      if (!coupon) {
        throw new AppError("Coupon not found.", { statusCode: 404 });
      }

      // Calculate specific metrics for this coupon
      const redemptions = coupon.redemptions || [];
      const firstPurchaseRedemptions = redemptions.filter(
        (r) => r.redemptionType === COUPON_REDEMPTION_TYPE.FIRST_PURCHASE
      ).length;
      const renewalRedemptions = redemptions.filter(
        (r) => r.redemptionType === COUPON_REDEMPTION_TYPE.RENEWAL
      ).length;

      const totalDiscountGranted = redemptions.reduce(
        (sum, r) => sum + Number(r.discountAmount || 0),
        0
      );
      const totalRevenueCollected = redemptions.reduce(
        (sum, r) => sum + Number(r.finalAmount || 0),
        0
      );

      return {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        maxDiscountAmount: coupon.maxDiscountAmount ? Number(coupon.maxDiscountAmount) : null,
        applicability: coupon.applicability,
        applicablePlans: coupon.applicablePlans,
        applicableCycles: coupon.applicableCycles,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        maxRedemptions: coupon.maxRedemptions,
        perCompanyLimit: coupon.perCompanyLimit,
        redemptionCount: coupon.redemptionCount,
        remainingCapacity:
          coupon.maxRedemptions !== null && coupon.maxRedemptions !== undefined
            ? Math.max(0, coupon.maxRedemptions - coupon.redemptionCount)
            : null,
        isActive: coupon.isActive,
        showOnPricingPage: Boolean(coupon.showOnPricingPage),
        publicDescription: coupon.publicDescription || null,
        displayPriority: coupon.displayPriority ?? 0,
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
        metrics: {
          totalRedemptions: coupon.redemptionCount,
          firstPurchaseRedemptions,
          renewalRedemptions,
          totalDiscountGranted: Math.round(totalDiscountGranted * 100) / 100,
          totalRevenueCollected: Math.round(totalRevenueCollected * 100) / 100,
        },
        redemptions: redemptions.map((r) => ({
          id: r.id,
          companyId: r.companyId,
          companyName: r.company?.name || "Unknown Company",
          companySlug: r.company?.slug || "",
          company: r.company || { name: "Company Workspace" },
          redemptionType: r.redemptionType,
          originalAmount: Number(r.originalAmount),
          discountAmount: Number(r.discountAmount),
          finalAmount: Number(r.finalAmount),
          currency: r.currency,
          paymentId: r.paymentId,
          createdAt: r.createdAt,
          redeemedAt: r.createdAt,
        })),
        recentRedemptions: redemptions.map((r) => ({
          id: r.id,
          companyId: r.companyId,
          companyName: r.company?.name || "Unknown Company",
          companySlug: r.company?.slug || "",
          company: r.company || { name: "Company Workspace" },
          redemptionType: r.redemptionType,
          originalAmount: Number(r.originalAmount),
          discountAmount: Number(r.discountAmount),
          finalAmount: Number(r.finalAmount),
          currency: r.currency,
          paymentId: r.paymentId,
          createdAt: r.createdAt,
          redeemedAt: r.createdAt,
        })),
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("Failed to retrieve coupon details: " + err.message, { statusCode: 500 });
    }
  }

  async createCoupon(data, tx = prisma) {
    const normalizedCode = data.code.trim().toUpperCase();

    // Check duplicate code
    const existing = await tx.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new AppError(`A coupon with code "${normalizedCode}" already exists.`, {
        statusCode: 409,
        code: COUPON_ERROR_CODES.COUPON_DUPLICATE_CODE,
        isOperational: true,
      });
    }

    const created = await tx.coupon.create({
      data: {
        code: normalizedCode,
        name: data.name?.trim() || null,
        discountType: data.discountType || COUPON_DISCOUNT_TYPE.PERCENTAGE,
        discountValue: Number(data.discountValue),
        maxDiscountAmount:
          data.maxDiscountAmount !== undefined && data.maxDiscountAmount !== null && data.maxDiscountAmount !== ""
            ? Number(data.maxDiscountAmount)
            : null,
        applicability: data.applicability || COUPON_APPLICABILITY.FIRST_PURCHASE,
        applicablePlans: Array.isArray(data.applicablePlans) ? data.applicablePlans : [],
        applicableCycles: Array.isArray(data.applicableCycles) ? data.applicableCycles : [],
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        maxRedemptions:
          data.maxRedemptions !== undefined && data.maxRedemptions !== null && data.maxRedemptions !== ""
            ? parseInt(data.maxRedemptions, 10)
            : null,
        perCompanyLimit:
          data.perCompanyLimit !== undefined && data.perCompanyLimit !== null && data.perCompanyLimit !== ""
            ? parseInt(data.perCompanyLimit, 10)
            : 1,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        showOnPricingPage: Boolean(data.showOnPricingPage),
        publicDescription: data.publicDescription ? data.publicDescription.trim() : null,
        displayPriority:
          data.displayPriority !== undefined && data.displayPriority !== null && data.displayPriority !== ""
            ? parseInt(data.displayPriority, 10)
            : 0,
      },
    });

    return created;
  }

  async updateCoupon(id, data, tx = prisma) {
    const existing = await tx.coupon.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Coupon not found.", { statusCode: 404 });
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name?.trim() || null;
    if (data.discountType !== undefined) updateData.discountType = data.discountType;
    if (data.discountValue !== undefined) updateData.discountValue = Number(data.discountValue);
    if (data.maxDiscountAmount !== undefined) {
      updateData.maxDiscountAmount =
        data.maxDiscountAmount !== null && data.maxDiscountAmount !== ""
          ? Number(data.maxDiscountAmount)
          : null;
    }
    if (data.applicability !== undefined) updateData.applicability = data.applicability;
    if (data.applicablePlans !== undefined) updateData.applicablePlans = data.applicablePlans;
    if (data.applicableCycles !== undefined) updateData.applicableCycles = data.applicableCycles;
    if (data.validFrom !== undefined) updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil !== undefined) {
      updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    }
    if (data.maxRedemptions !== undefined) {
      updateData.maxRedemptions =
        data.maxRedemptions !== null && data.maxRedemptions !== ""
          ? parseInt(data.maxRedemptions, 10)
          : null;
    }
    if (data.perCompanyLimit !== undefined) {
      updateData.perCompanyLimit =
        data.perCompanyLimit !== null && data.perCompanyLimit !== ""
          ? parseInt(data.perCompanyLimit, 10)
          : null;
    }
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
    if (data.showOnPricingPage !== undefined) updateData.showOnPricingPage = Boolean(data.showOnPricingPage);
    if (data.publicDescription !== undefined) {
      updateData.publicDescription = data.publicDescription ? data.publicDescription.trim() : null;
    }
    if (data.displayPriority !== undefined) {
      updateData.displayPriority =
        data.displayPriority !== null && data.displayPriority !== ""
          ? parseInt(data.displayPriority, 10)
          : 0;
    }

    const updated = await tx.coupon.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  async toggleCouponStatus(id, isActive, tx = prisma) {
    const existing = await tx.coupon.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Coupon not found.", { statusCode: 404 });
    }

    const newStatus = isActive !== undefined ? Boolean(isActive) : !existing.isActive;

    const updated = await tx.coupon.update({
      where: { id },
      data: { isActive: newStatus },
    });

    return updated;
  }

  async deleteCoupon(id, tx = prisma) {
    const existing = await tx.coupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });

    if (!existing) {
      throw new AppError("Coupon not found.", { statusCode: 404 });
    }

    // If coupon has been redeemed, soft-deactivate to preserve payment audit history
    if (existing._count?.redemptions > 0 || existing.redemptionCount > 0) {
      await tx.coupon.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        success: true,
        deactivated: true,
        message: "Coupon has existing redemptions and was deactivated instead of deleted to protect audit logs.",
      };
    }

    await tx.coupon.delete({ where: { id } });
    return { success: true, deleted: true, message: "Coupon deleted successfully." };
  }

  /**
   * Super Admin Reporting: Aggregates metrics across all coupons.
   * Requirement 4:
   * - Coupon usage count
   * - Successful discounted payments
   * - Total discount granted
   * - Revenue collected after discounts
   * - First purchase versus renewal redemptions
   * - Remaining coupon usage capacity
   */
  async getCouponReportingSummary(tx = prisma) {
    try {
      if (!tx.coupon) {
        return {
          totalCoupons: 0,
          activeCoupons: 0,
          totalRedemptions: 0,
          successfulDiscountedPayments: 0,
          totalDiscountGranted: 0,
          totalRevenueCollected: 0,
          firstPurchaseRedemptions: 0,
          renewalRedemptions: 0,
          topCoupons: [],
        };
      }

      const [totalCoupons, activeCoupons, coupons] = await Promise.all([
        tx.coupon.count(),
        tx.coupon.count({ where: { isActive: true } }),
        tx.coupon.findMany({
          include: {
            redemptions: {
              select: {
                id: true,
                redemptionType: true,
                originalAmount: true,
                discountAmount: true,
                finalAmount: true,
                paymentId: true,
              },
            },
          },
        }),
      ]);

      let totalRedemptions = 0;
      let firstPurchaseRedemptions = 0;
      let renewalRedemptions = 0;
      let totalDiscountGranted = 0;
      let totalRevenueCollected = 0;
      const paymentIdSet = new Set();

      coupons.forEach((c) => {
        totalRedemptions += c.redemptionCount || 0;
        const reds = c.redemptions || [];
        reds.forEach((r) => {
          if (r.redemptionType === COUPON_REDEMPTION_TYPE.RENEWAL) {
            renewalRedemptions++;
          } else {
            firstPurchaseRedemptions++;
          }
          totalDiscountGranted += Number(r.discountAmount || 0);
          totalRevenueCollected += Number(r.finalAmount || 0);
          if (r.paymentId) paymentIdSet.add(r.paymentId);
        });
      });

      // Top performing coupons sorted by redemption count
      const topCoupons = [...coupons]
        .sort((a, b) => (b.redemptionCount || 0) - (a.redemptionCount || 0))
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          applicability: c.applicability,
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          redemptionCount: c.redemptionCount,
          maxRedemptions: c.maxRedemptions,
          remainingCapacity:
            c.maxRedemptions !== null && c.maxRedemptions !== undefined
              ? Math.max(0, c.maxRedemptions - c.redemptionCount)
              : "Unlimited",
          isActive: c.isActive,
        }));

      return {
        totalCoupons,
        activeCoupons,
        totalRedemptions,
        successfulDiscountedPayments: paymentIdSet.size,
        totalDiscountGranted: Math.round(totalDiscountGranted * 100) / 100,
        totalRevenueCollected: Math.round(totalRevenueCollected * 100) / 100,
        firstPurchaseRedemptions,
        renewalRedemptions,
        topCoupons,
      };
    } catch (err) {
      console.warn("[getCouponReportingSummary] Query fallback:", err.message);
      return {
        totalCoupons: 0,
        activeCoupons: 0,
        totalRedemptions: 0,
        successfulDiscountedPayments: 0,
        totalDiscountGranted: 0,
        totalRevenueCollected: 0,
        firstPurchaseRedemptions: 0,
        renewalRedemptions: 0,
        topCoupons: [],
      };
    }
  }

  /**
   * Retrieves active, eligible public coupons for display on the public pricing page.
   * Strips all internal, sensitive redemption metadata and ensures expired / limit-reached offers are hidden.
   */
  async getPublicOffers({ planCode, billingCycle } = {}, tx = prisma) {
    try {
      if (!tx.coupon) return [];

      const now = new Date();

      const coupons = await tx.coupon.findMany({
        where: {
          showOnPricingPage: true,
          isActive: true,
          validFrom: { lte: now },
          OR: [
            { validUntil: null },
            { validUntil: { gte: now } },
          ],
        },
        orderBy: [
          { displayPriority: "desc" },
          { createdAt: "desc" },
        ],
      });

      const filtered = coupons.filter((c) => {
        // Enforce max redemption capacity: if maxRedemptions is reached, hide offer
        if (c.maxRedemptions !== null && c.maxRedemptions !== undefined) {
          if (c.redemptionCount >= c.maxRedemptions) return false;
        }

        // Filter by plan eligibility if requested
        if (planCode && Array.isArray(c.applicablePlans) && c.applicablePlans.length > 0) {
          const normalizedPlan = planCode.toUpperCase();
          if (!c.applicablePlans.map((p) => p.toUpperCase()).includes(normalizedPlan)) {
            return false;
          }
        }

        // Filter by billing cycle eligibility if requested
        if (billingCycle && Array.isArray(c.applicableCycles) && c.applicableCycles.length > 0) {
          const normalizedCycle = billingCycle.toUpperCase();
          if (!c.applicableCycles.map((cy) => cy.toUpperCase()).includes(normalizedCycle)) {
            return false;
          }
        }

        return true;
      });

      // Public sanitized payload (no internal/sensitive redemption data)
      return filtered.map((c) => ({
        code: c.code,
        name: c.name,
        publicDescription: c.publicDescription || null,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        maxDiscountAmount: c.maxDiscountAmount ? Number(c.maxDiscountAmount) : null,
        applicability: c.applicability,
        applicablePlans: c.applicablePlans || [],
        applicableCycles: c.applicableCycles || [],
        validUntil: c.validUntil ? c.validUntil.toISOString() : null,
        displayPriority: c.displayPriority || 0,
      }));
    } catch (err) {
      console.warn("[getPublicOffers] Database query fallback:", err.message);
      return [];
    }
  }
}

module.exports = new CouponService();
