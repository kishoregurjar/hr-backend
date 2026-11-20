"use strict";

const { z } = require("zod");
const { COUPON_DISCOUNT_TYPE, COUPON_APPLICABILITY } = require("./coupon.constants");

const createCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Coupon code must be at least 3 characters")
    .max(30, "Coupon code cannot exceed 30 characters")
    .regex(/^[A-Za-z0-9_-]+$/, "Coupon code can only contain letters, numbers, hyphens, and underscores")
    .transform((val) => val.toUpperCase()),
  name: z.string().trim().max(100).optional().nullable(),
  discountType: z.enum([COUPON_DISCOUNT_TYPE.PERCENTAGE, COUPON_DISCOUNT_TYPE.FIXED]).default(COUPON_DISCOUNT_TYPE.PERCENTAGE),
  discountValue: z.coerce
    .number()
    .positive("Discount value must be greater than 0"),
  maxDiscountAmount: z.coerce
    .number()
    .positive("Maximum discount cap must be positive")
    .optional()
    .nullable(),
  applicability: z.enum([COUPON_APPLICABILITY.FIRST_PURCHASE, COUPON_APPLICABILITY.EVERY_RENEWAL]).default(COUPON_APPLICABILITY.FIRST_PURCHASE),
  applicablePlans: z.array(z.string().trim().toUpperCase()).default([]),
  applicableCycles: z.array(z.string().trim().toUpperCase()).default([]),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional().nullable(),
  maxRedemptions: z.coerce
    .number()
    .int()
    .positive("Total redemption limit must be at least 1")
    .optional()
    .nullable(),
  perCompanyLimit: z.coerce
    .number()
    .int()
    .positive("Per-company redemption limit must be at least 1")
    .default(1)
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
  showOnPricingPage: z.boolean().default(false).optional(),
  publicDescription: z.string().trim().max(255).optional().nullable(),
  displayPriority: z.coerce.number().int().default(0).optional(),
}).refine(
  (data) => {
    if (data.discountType === COUPON_DISCOUNT_TYPE.PERCENTAGE) {
      return data.discountValue > 0 && data.discountValue <= 100;
    }
    return true;
  },
  {
    message: "Percentage discount must be between 0.01% and 100%",
    path: ["discountValue"],
  }
).refine(
  (data) => {
    if (data.validFrom && data.validUntil) {
      return new Date(data.validUntil) >= new Date(data.validFrom);
    }
    return true;
  },
  {
    message: "Expiry date must be on or after start date",
    path: ["validUntil"],
  }
);

const updateCouponSchema = z.object({
  name: z.string().trim().max(100).optional().nullable(),
  discountType: z.enum([COUPON_DISCOUNT_TYPE.PERCENTAGE, COUPON_DISCOUNT_TYPE.FIXED]).optional(),
  discountValue: z.coerce.number().positive().optional(),
  maxDiscountAmount: z.coerce.number().positive().optional().nullable(),
  applicability: z.enum([COUPON_APPLICABILITY.FIRST_PURCHASE, COUPON_APPLICABILITY.EVERY_RENEWAL]).optional(),
  applicablePlans: z.array(z.string().trim().toUpperCase()).optional(),
  applicableCycles: z.array(z.string().trim().toUpperCase()).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional().nullable(),
  maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
  perCompanyLimit: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  showOnPricingPage: z.boolean().optional(),
  publicDescription: z.string().trim().max(255).optional().nullable(),
  displayPriority: z.coerce.number().int().optional(),
}).refine(
  (data) => {
    if (data.discountType === COUPON_DISCOUNT_TYPE.PERCENTAGE && data.discountValue !== undefined) {
      return data.discountValue > 0 && data.discountValue <= 100;
    }
    return true;
  },
  {
    message: "Percentage discount must be between 0.01% and 100%",
    path: ["discountValue"],
  }
);

const validateCouponSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required").transform((val) => val.toUpperCase()),
  planCode: z.string().trim().min(1, "Plan code is required").transform((val) => val.toUpperCase()),
  billingCycle: z.string().trim().toUpperCase().optional().default("MONTHLY"),
  companyId: z.string().optional().nullable(),
  isRenewal: z.boolean().optional().default(false),
});

module.exports = {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
};
