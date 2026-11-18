"use strict";

const COMPANY_PLANS = Object.freeze({
  DEMO: "DEMO",
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  BUSINESS: "BUSINESS",
  ENTERPRISE: "ENTERPRISE",
});

const COMPANY_PLAN_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  DEMO_EXPIRED: "DEMO_EXPIRED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

const BILLING_CYCLES = Object.freeze({
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
});

const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  DEMO_EXPIRED: "DEMO_EXPIRED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});

const PLAN_LIMITS = Object.freeze({
  [COMPANY_PLANS.DEMO]: Object.freeze({
    name: "Demo",
    hrSeats: null, // Unlimited for 30-day evaluation
    totalCandidates: null, // Unlimited
    monthlyInvitations: null, // Unlimited
    durationHours: 720, // 30 days (30 * 24 hours)
  }),
  [COMPANY_PLANS.STARTER]: Object.freeze({
    name: "Starter",
    hrSeats: 2,
    totalCandidates: 200,
    monthlyInvitations: 50,
    durationHours: null,
  }),
  [COMPANY_PLANS.GROWTH]: Object.freeze({
    name: "Growth",
    hrSeats: 5,
    totalCandidates: 1000,
    monthlyInvitations: 300,
    durationHours: null,
  }),
  [COMPANY_PLANS.BUSINESS]: Object.freeze({
    name: "Business",
    hrSeats: 15,
    totalCandidates: 5000,
    monthlyInvitations: 1000,
    durationHours: null,
  }),
  [COMPANY_PLANS.ENTERPRISE]: Object.freeze({
    name: "Enterprise",
    hrSeats: null, // Custom
    totalCandidates: null, // Custom
    monthlyInvitations: null, // Custom
    durationHours: null,
  }),
});

const PLAN_ERROR_CODES = Object.freeze({
  PLAN_EXPIRED: "PLAN_EXPIRED",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",
  HR_SEATS_LIMIT_EXCEEDED: "HR_SEATS_LIMIT_EXCEEDED",
  CANDIDATE_LIMIT_EXCEEDED: "CANDIDATE_LIMIT_REACHED",
  CANDIDATE_LIMIT_REACHED: "CANDIDATE_LIMIT_REACHED",
  INVITATIONS_LIMIT_EXCEEDED: "INVITATIONS_LIMIT_EXCEEDED",
  INVALID_PLAN: "INVALID_PLAN",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  PLAN_HAS_ACTIVE_SUBSCRIBERS: "PLAN_HAS_ACTIVE_SUBSCRIBERS",
  TRIAL_ALREADY_USED: "TRIAL_ALREADY_USED",
  OWNER_ACTION_REQUIRED: "OWNER_ACTION_REQUIRED",
});

module.exports = {
  COMPANY_PLANS,
  COMPANY_PLAN_STATUS,
  BILLING_CYCLES,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  PLAN_LIMITS,
  PLAN_ERROR_CODES,
};
