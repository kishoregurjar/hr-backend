"use strict";

const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const { AppError } = require("../../utils/app-error");
const {
  COMPANY_PLANS,
  COMPANY_PLAN_STATUS,
  PLAN_LIMITS,
  PLAN_ERROR_CODES,
  BILLING_CYCLES,
  SUBSCRIPTION_STATUS,
} = require("./plan.constants");
const {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} = require("../auth/auth.utils");
const { buildCompanyTenantUrl } = require("../../utils/tenant-url");

/**
 * Returns effective plan limits for a company.
 * Prioritizes active Subscription snapshot if present (preserving original purchase terms).
 * Falls back to Company model plan and custom limit fields.
 */
const getEffectivePlanLimits = async (company, tx = prisma, preloadedSubscription = undefined) => {
  if (!company) {
    return {
      name: "Starter",
      planCode: COMPANY_PLANS.STARTER,
      hrSeats: 2,
      totalCandidates: 200,
      monthlyInvitations: 50,
      durationHours: null,
      isSnapshot: false,
    };
  }

  // 1. Check for an active Subscription snapshot (use preloaded if provided)
  if (company.id) {
    try {
      const activeSubscription =
        preloadedSubscription !== undefined
          ? (preloadedSubscription?.status === SUBSCRIPTION_STATUS.ACTIVE && new Date(preloadedSubscription.endDate) >= new Date()
              ? preloadedSubscription
              : null)
          : await tx.subscription.findFirst({
              where: {
                companyId: company.id,
                status: SUBSCRIPTION_STATUS.ACTIVE,
                endDate: { gte: new Date() },
              },
              orderBy: { createdAt: "desc" },
            });

      if (activeSubscription) {
        return {
          name: activeSubscription.planName,
          planCode: activeSubscription.planCode,
          hrSeats: activeSubscription.seatLimit,
          totalCandidates: activeSubscription.candidateLimit,
          monthlyInvitations: activeSubscription.inviteLimit,
          billingCycle: activeSubscription.billingCycle,
          amount: Number(activeSubscription.amount),
          currency: activeSubscription.currency,
          durationHours: null,
          isSnapshot: true,
          subscriptionId: activeSubscription.id,
        };
      }
    } catch (_) {
      // Fallback if subscription query encounters issues during initialization
    }
  }

  // 2. Query dynamic Plan catalog entry from database
  const planKey = (company.plan || COMPANY_PLANS.STARTER).toUpperCase();
  let dbPlan = null;
  try {
    dbPlan = await tx.plan.findUnique({ where: { code: planKey } });
  } catch (_) {}

  if (planKey === COMPANY_PLANS.ENTERPRISE) {
    return {
      name: dbPlan?.name || "Enterprise",
      planCode: COMPANY_PLANS.ENTERPRISE,
      hrSeats: company.customSeatLimit !== undefined && company.customSeatLimit !== null
        ? Number(company.customSeatLimit)
        : (dbPlan?.seatLimit ?? null),
      totalCandidates: company.customCandidateLimit !== undefined && company.customCandidateLimit !== null
        ? Number(company.customCandidateLimit)
        : (dbPlan?.candidateLimit ?? null),
      monthlyInvitations: company.customInviteLimit !== undefined && company.customInviteLimit !== null
        ? Number(company.customInviteLimit)
        : (dbPlan?.inviteLimit ?? null),
      durationHours: null,
      isSnapshot: false,
    };
  }

  if (dbPlan) {
    return {
      name: dbPlan.name,
      planCode: dbPlan.code,
      hrSeats: dbPlan.seatLimit,
      totalCandidates: dbPlan.candidateLimit,
      monthlyInvitations: dbPlan.inviteLimit,
      durationHours: dbPlan.durationDays ? dbPlan.durationDays * 24 : null,
      isSnapshot: false,
    };
  }

  const baseConfig = PLAN_LIMITS[planKey] || PLAN_LIMITS[COMPANY_PLANS.STARTER];
  return {
    ...baseConfig,
    planCode: planKey,
    isSnapshot: false,
  };
};

/**
 * Checks whether a company's plan has expired or been cancelled.
 * Automatically transitions status in DB if past planExpiresAt or subscription endDate.
 */
const checkCompanyPlanStatus = async (company, tx = prisma, preloadedSubscription = undefined) => {
  if (!company) return { isExpired: false };

  const currentStatus = company.planStatus || COMPANY_PLAN_STATUS.ACTIVE;

  // Explicit non-active statuses
  if (
    currentStatus === COMPANY_PLAN_STATUS.DEMO_EXPIRED ||
    currentStatus === COMPANY_PLAN_STATUS.EXPIRED ||
    currentStatus === COMPANY_PLAN_STATUS.CANCELLED
  ) {
    return {
      isExpired: true,
      status: currentStatus,
      reason: "Your plan has expired. Please contact the platform administrator to purchase or renew your subscription.",
    };
  }

  const now = new Date();

  // Fast-path: If company is active and expiration is comfortably in the future, avoid querying DB
  if (
    currentStatus === COMPANY_PLAN_STATUS.ACTIVE &&
    company.planExpiresAt &&
    new Date(company.planExpiresAt) > now
  ) {
    return { isExpired: false, status: currentStatus };
  }

  // Check active subscription expiration if present
  if (company.id) {
    try {
      const activeSubscription =
        preloadedSubscription !== undefined
          ? preloadedSubscription
          : await tx.subscription.findFirst({
              where: {
                companyId: company.id,
                status: SUBSCRIPTION_STATUS.ACTIVE,
              },
              orderBy: { createdAt: "desc" },
            });

      if (activeSubscription && activeSubscription.endDate <= now) {
        const newStatus = activeSubscription.isTrial
          ? SUBSCRIPTION_STATUS.DEMO_EXPIRED
          : SUBSCRIPTION_STATUS.EXPIRED;

        await tx.subscription.update({
          where: { id: activeSubscription.id },
          data: { status: newStatus },
        });

        await tx.company.update({
          where: { id: company.id },
          data: { planStatus: newStatus },
        });

        company.planStatus = newStatus;

        try {
          const socketService = require("../../socket/socket.service");
          if (socketService && typeof socketService.disconnectCompanySockets === "function") {
            socketService.disconnectCompanySockets(company.id);
          }
        } catch (_) {}

        return {
          isExpired: true,
          status: newStatus,
          reason: "Your plan has expired. Please contact the platform administrator to purchase or renew your subscription.",
        };
      }
    } catch (_) {}
  }

  // Check company timestamp expiration
  if (company.planExpiresAt) {
    const expiresAt = new Date(company.planExpiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && now >= expiresAt) {
      const newStatus =
        company.plan === COMPANY_PLANS.DEMO
          ? COMPANY_PLAN_STATUS.DEMO_EXPIRED
          : COMPANY_PLAN_STATUS.EXPIRED;

      try {
        await tx.company.update({
          where: { id: company.id },
          data: { planStatus: newStatus },
        });
        company.planStatus = newStatus;

        try {
          const socketService = require("../../socket/socket.service");
          if (socketService && typeof socketService.disconnectCompanySockets === "function") {
            socketService.disconnectCompanySockets(company.id);
          }
        } catch (_) {}
      } catch (err) {}

      return {
        isExpired: true,
        status: newStatus,
        reason: "Your plan has expired. Please contact the platform administrator to purchase or renew your subscription.",
      };
    }
  }

  return { isExpired: false, status: currentStatus };
};

/**
 * Helper to throw standard Plan Expired error
 */
const assertCompanyPlanActive = async (companyOrId, tx = prisma) => {
  let company = companyOrId;
  if (typeof companyOrId === "string") {
    company = await tx.company.findUnique({
      where: { id: companyOrId },
      select: {
        id: true,
        plan: true,
        planStatus: true,
        planExpiresAt: true,
        customSeatLimit: true,
        customCandidateLimit: true,
        customInviteLimit: true,
      },
    });
  }

  if (!company) return;

  const statusCheck = await checkCompanyPlanStatus(company, tx);
  if (statusCheck.isExpired) {
    throw new AppError(statusCheck.reason, {
      statusCode: 403,
      code: PLAN_ERROR_CODES.PLAN_EXPIRED,
      isOperational: true,
    });
  }
};

/**
 * Calculates start of the current calendar month in UTC
 */
const getStartOfCurrentMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
};

/**
 * Retrieves comprehensive usage data and quota limits for a company.
 */
const getCompanyUsage = async (companyOrId, tx = prisma) => {
  let company =
    typeof companyOrId === "object" && companyOrId !== null && companyOrId.id
      ? companyOrId
      : null;

  if (!company) {
    company = await tx.company.findUnique({
      where: { id: companyOrId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        planStatus: true,
        planStartedAt: true,
        planExpiresAt: true,
        customSeatLimit: true,
        customCandidateLimit: true,
        customInviteLimit: true,
        hasUsedDemo: true,
      },
    });
  }

  if (!company) {
    throw new AppError("Company not found", {
      statusCode: 404,
      code: "COMPANY_NOT_FOUND",
      isOperational: true,
    });
  }

  const companyId = company.id;

  // Single subscription query for both active and latest snapshot (replaces multiple sequential queries)
  let activeSubscription = null;
  try {
    const recentSubs = await tx.subscription.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    activeSubscription =
      recentSubs.find(
        (s) => s.status === SUBSCRIPTION_STATUS.ACTIVE && new Date(s.endDate) >= new Date()
      ) ||
      recentSubs[0] ||
      null;
  } catch (_) {
    activeSubscription = null;
  }

  // Refresh status if expired, passing preloaded subscription
  await checkCompanyPlanStatus(company, tx, activeSubscription);

  // Get effective plan limits using preloaded subscription
  const limits = await getEffectivePlanLimits(company, tx, activeSubscription);
  const startOfMonth = getStartOfCurrentMonth();

  const [activeHrSeats, totalCandidates, monthlyInvitations] = await Promise.all([
    // Active HR Seats: ADMIN or RECRUITER with User.status === 'ACTIVE'. (OWNER does not consume a seat)
    tx.companyMember.count({
      where: {
        companyId,
        role: { in: ["ADMIN", "RECRUITER"] },
        user: { status: "ACTIVE" },
      },
    }),

    // Total Lifetime Unique Candidates
    tx.companyCandidate.count({
      where: { companyId },
    }),

    // Assessment Invitations dispatched in current calendar month
    tx.invitation.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  // Demo Remaining Time calculation
  let demoRemaining = null;
  const isDemoActive =
    company.plan === COMPANY_PLANS.DEMO ||
    activeSubscription?.isTrial === true;

  const expiryTimestamp = activeSubscription?.endDate || company.planExpiresAt;

  if (isDemoActive && expiryTimestamp) {
    const expiresMs = new Date(expiryTimestamp).getTime();
    const nowMs = Date.now();
    const diffMs = Math.max(0, expiresMs - nowMs);
    const totalRemainingHours = Math.floor(diffMs / (1000 * 60 * 60));
    const remainingDays = Math.floor(totalRemainingHours / 24);
    const remainingHours = totalRemainingHours % 24;

    demoRemaining = {
      isExpired: diffMs <= 0,
      totalHours: totalRemainingHours,
      days: remainingDays,
      hours: remainingHours,
      formatted: diffMs <= 0 ? "Expired" : `${remainingDays}d ${remainingHours}h remaining`,
    };
  }

  const mappedSubscription = activeSubscription
    ? {
        id: activeSubscription.id,
        planCode: activeSubscription.planCode,
        planName: activeSubscription.planName,
        billingCycle: activeSubscription.billingCycle,
        status: activeSubscription.status,
        amount: Number(activeSubscription.amount),
        currency: activeSubscription.currency,
        seatLimit: activeSubscription.seatLimit,
        candidateLimit: activeSubscription.candidateLimit,
        inviteLimit: activeSubscription.inviteLimit,
        startDate: activeSubscription.startDate,
        endDate: activeSubscription.endDate,
        isTrial: activeSubscription.isTrial,
      }
    : null;

  return {
    plan: limits.planCode || company.plan,
    planName: limits.name,
    planStatus: company.planStatus,
    planStartedAt: activeSubscription?.startDate || company.planStartedAt,
    planExpiresAt: expiryTimestamp,
    demoRemaining,
    hasUsedDemo: Boolean(company.hasUsedDemo),
    activeSubscription: mappedSubscription,
    subscription: mappedSubscription,
    company: {
      id: company.id,
      name: company.name,
      plan: limits.planCode || company.plan,
      planStatus: company.planStatus,
      hasUsedDemo: Boolean(company.hasUsedDemo),
      isPlanExpired: company.planStatus !== COMPANY_PLAN_STATUS.ACTIVE,
    },
    limits,
    effectiveLimits: {
      seatLimit: limits.hrSeats,
      candidateLimit: limits.totalCandidates,
      inviteLimit: limits.monthlyInvitations,
    },
    usage: {
      activeHrSeats,
      totalCandidates,
      monthlyInvites: monthlyInvitations,
      hrSeats: {
        used: activeHrSeats,
        limit: limits.hrSeats,
        remaining: limits.hrSeats !== null ? Math.max(0, limits.hrSeats - activeHrSeats) : null,
      },
      candidates: {
        used: totalCandidates,
        limit: limits.totalCandidates,
        remaining: limits.totalCandidates !== null ? Math.max(0, limits.totalCandidates - totalCandidates) : null,
      },
      invitations: {
        used: monthlyInvitations,
        limit: limits.monthlyInvitations,
        remaining: limits.monthlyInvitations !== null ? Math.max(0, limits.monthlyInvitations - monthlyInvitations) : null,
      },
    },
  };
};

/**
 * Asserts that the company has enough HR seat capacity to invite/reactivate members.
 */
const assertCanAddHrSeat = async (companyId, seatsToAdd = 1, tx = prisma) => {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      planExpiresAt: true,
      customSeatLimit: true,
      customCandidateLimit: true,
      customInviteLimit: true,
    },
  });

  if (!company) return;

  await assertCompanyPlanActive(company, tx);

  const limits = await getEffectivePlanLimits(company, tx);
  if (limits.hrSeats === null) {
    return;
  }

  const currentActiveSeats = await tx.companyMember.count({
    where: {
      companyId,
      role: { in: ["ADMIN", "RECRUITER"] },
      user: { status: "ACTIVE" },
    },
  });

  if (currentActiveSeats + seatsToAdd > limits.hrSeats) {
    throw new AppError(
      `Active HR seat limit reached for your plan (${currentActiveSeats}/${limits.hrSeats}). Please contact the platform administrator to upgrade your plan.`,
      {
        statusCode: 403,
        code: PLAN_ERROR_CODES.HR_SEATS_LIMIT_EXCEEDED,
        isOperational: true,
        details: {
          current: currentActiveSeats,
          limit: limits.hrSeats,
          requested: seatsToAdd,
        },
      }
    );
  }
};

/**
 * Asserts that the company has enough lifetime candidate capacity.
 * Concurrency Protection: Uses PostgreSQL row-level locking (SELECT ... FOR UPDATE)
 * inside a database transaction to serialize concurrent candidate additions and eliminate race conditions.
 */
const assertCanAddCandidates = async (companyId, candidatesToAdd = 1, tx = prisma) => {
  if (candidatesToAdd <= 0) return;

  // 1. Acquire row-level lock on the Company record to serialize concurrent operations
  try {
    if (typeof tx.$executeRawUnsafe === "function") {
      await tx.$executeRawUnsafe('SELECT id FROM "Company" WHERE id = $1 FOR UPDATE', companyId);
    }
  } catch (lockErr) {
    // Fallback if not running in a raw query compatible transaction
  }

  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      planExpiresAt: true,
      customSeatLimit: true,
      customCandidateLimit: true,
      customInviteLimit: true,
    },
  });

  if (!company) return;

  await assertCompanyPlanActive(company, tx);

  const limits = await getEffectivePlanLimits(company, tx);
  if (limits.totalCandidates === null) {
    return;
  }

  const currentCandidates = await tx.companyCandidate.count({
    where: { companyId },
  });

  if (currentCandidates + candidatesToAdd > limits.totalCandidates) {
    const remaining = Math.max(0, limits.totalCandidates - currentCandidates);
    throw new AppError(
      "You have reached your plan's maximum unique candidate limit. Upgrade your plan to add more candidates.",
      {
        statusCode: 403,
        code: PLAN_ERROR_CODES.CANDIDATE_LIMIT_REACHED,
        isOperational: true,
        details: {
          currentUsage: currentCandidates,
          allowedLimit: limits.totalCandidates,
          remaining,
          currentPlan: limits.name || company.plan,
        },
      }
    );
  }
};

/**
 * Asserts that the company has enough monthly assessment invitation quota.
 */
const assertCanSendInvitations = async (companyId, invitationsToSend = 1, tx = prisma) => {
  if (invitationsToSend <= 0) return;

  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      plan: true,
      planStatus: true,
      planExpiresAt: true,
      customSeatLimit: true,
      customCandidateLimit: true,
      customInviteLimit: true,
    },
  });

  if (!company) return;

  await assertCompanyPlanActive(company, tx);

  const limits = await getEffectivePlanLimits(company, tx);
  if (limits.monthlyInvitations === null) {
    return;
  }

  const startOfMonth = getStartOfCurrentMonth();
  const currentMonthInvitations = await tx.invitation.count({
    where: {
      companyId,
      createdAt: { gte: startOfMonth },
    },
  });

  if (currentMonthInvitations + invitationsToSend > limits.monthlyInvitations) {
    const remaining = Math.max(0, limits.monthlyInvitations - currentMonthInvitations);
    throw new AppError(
      `Monthly assessment invitation limit reached for your plan (${currentMonthInvitations}/${limits.monthlyInvitations}). Remaining: ${remaining}. Please contact the platform administrator to upgrade your plan.`,
      {
        statusCode: 403,
        code: PLAN_ERROR_CODES.INVITATIONS_LIMIT_EXCEEDED,
        isOperational: true,
        details: {
          current: currentMonthInvitations,
          limit: limits.monthlyInvitations,
          remaining,
          requested: invitationsToSend,
        },
      }
    );
  }
};

/**
 * Starts the free 7-day Demo trial for a company.
 * Strict Rule: Only Company OWNER can invoke this. Trial can only be started ONCE per company.
 */
const startDemoTrial = async (companyId, actorRole, tx = prisma) => {
  if (actorRole !== "OWNER" && actorRole !== "COMPANY_OWNER") {
    throw new AppError("Only the company owner can start the free Demo trial.", {
      statusCode: 403,
      code: PLAN_ERROR_CODES.OWNER_ACTION_REQUIRED,
      isOperational: true,
    });
  }

  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      hasUsedDemo: true,
      subscriptions: {
        where: { isTrial: true },
        take: 1,
      },
    },
  });

  if (!company) {
    throw new AppError("Company not found", {
      statusCode: 404,
      code: "COMPANY_NOT_FOUND",
      isOperational: true,
    });
  }

  if (company.hasUsedDemo || (company.subscriptions && company.subscriptions.length > 0)) {
    throw new AppError(
      "Your organization has already used its free 30-day Demo trial. Please choose a paid subscription plan.",
      {
        statusCode: 400,
        code: PLAN_ERROR_CODES.TRIAL_ALREADY_USED,
        isOperational: true,
      }
    );
  }

  // Look up Demo plan catalog entry defensively
  let demoPlan = null;
  try {
    demoPlan = await tx.plan.findUnique({
      where: { code: COMPANY_PLANS.DEMO },
    });
  } catch (_) {}

  if (!demoPlan) {
    demoPlan = {
      id: "demo",
      code: "DEMO",
      name: "Demo Plan",
      seatLimit: 2,
      candidateLimit: 20,
      inviteLimit: 10,
      durationDays: 30,
    };
  }

  const durationDays = demoPlan.durationDays || 30;
  const now = new Date();
  const trialEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000); // 30 days (720 hours)

  // Expire any previous active subscriptions defensively
  try {
    await tx.subscription.updateMany({
      where: { companyId, status: SUBSCRIPTION_STATUS.ACTIVE },
      data: { status: SUBSCRIPTION_STATUS.EXPIRED },
    });
  } catch (_) {}

  // Create immutable trial subscription snapshot defensively
  let subscription = null;
  try {
    subscription = await tx.subscription.create({
      data: {
        companyId,
        planId: demoPlan?.id || null,
        planCode: COMPANY_PLANS.DEMO,
        planName: demoPlan?.name || "Demo Trial",
        billingCycle: BILLING_CYCLES.MONTHLY,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        amount: 0.0,
        currency: "INR",
        seatLimit: demoPlan?.seatLimit ?? 2,
        candidateLimit: demoPlan?.candidateLimit ?? 20,
        inviteLimit: demoPlan?.inviteLimit ?? 10,
        startDate: now,
        endDate: trialEnd,
        isTrial: true,
      },
    });
  } catch (_) {}

  // Update Company defensively
  try {
    await tx.company.update({
      where: { id: companyId },
      data: {
        plan: COMPANY_PLANS.DEMO,
        planStatus: COMPANY_PLAN_STATUS.ACTIVE,
        planStartedAt: now,
        planExpiresAt: trialEnd,
        hasUsedDemo: true,
      },
    });
  } catch (_) {
    // If plan columns don't exist in unmigrated database, skip updating plan columns
  }

  // Invalidate in-memory caches
  try {
    const { clearCompanyContextCache } = require("../company/company.context");
    const { clearUserCache } = require("../../middleware/requireAuth");
    const members = await tx.companyMember.findMany({
      where: { companyId },
      select: { userId: true },
    });
    for (const m of members) {
      if (clearUserCache) clearUserCache(m.userId);
      if (clearCompanyContextCache) clearCompanyContextCache(m.userId);
    }
  } catch (_) {}

  return subscription;
};

/**
 * Retrieves all active plans for public/company display.
 */
const getActivePlans = async (tx = prisma) => {
  let plans = [];
  try {
    plans = await tx.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch (err) {
    console.warn("[getActivePlans] Database query failed, using empty list:", err.message);
    plans = [];
  }

  // Auto-seed default plans if database table is empty
  if (!plans || plans.length === 0) {
    try {
      const { DEFAULT_PLANS } = require("../../scripts/seed-plans");
      for (const plan of DEFAULT_PLANS) {
        await tx.plan.upsert({
          where: { code: plan.code },
          update: {},
          create: plan,
        });
      }
      plans = await tx.plan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });
    } catch (seedErr) {
      console.warn("[getActivePlans] Auto-seeding fallback warning:", seedErr.message);
    }
  }

  if (!plans || plans.length === 0) {
    try {
      const { DEFAULT_PLANS } = require("../../scripts/seed-plans");
      plans = DEFAULT_PLANS;
    } catch (_) {}
  }

  // Self-healing: Automatically upgrade DEMO plan from 7-day to 30-day in memory and database
  if (Array.isArray(plans)) {
    for (const p of plans) {
      if (p.code === "DEMO" && (p.durationDays === 7 || (p.description && p.description.includes("7-day")))) {
        p.durationDays = 30;
        p.description = "30-day free trial with standard feature access for evaluation.";
        if (p.id) {
          try {
            await tx.plan.update({
              where: { id: p.id },
              data: {
                durationDays: 30,
                description: "30-day free trial with standard feature access for evaluation.",
              },
            });
          } catch (_) {}
        }
      }
    }
  }

  return (plans || []).map((p) => ({
    id: p.id || p.code?.toLowerCase() || `plan-${p.code || "custom"}`,
    code: p.code,
    name: p.name,
    description: p.description,
    monthlyPrice: Number(p.monthlyPrice) || 0,
    yearlyPrice: Number(p.yearlyPrice) || 0,
    currency: p.currency || "INR",
    seatLimit: p.seatLimit,
    candidateLimit: p.candidateLimit,
    inviteLimit: p.inviteLimit,
    durationDays: p.durationDays,
    isTrial: Boolean(p.isTrial),
    isCustom: Boolean(p.isCustom),
    isPopular: Boolean(p.isPopular),
    sortOrder: p.sortOrder || 0,
  }));
};

/**
 * Super Admin: Retrieves all plans with subscriber counts.
 */
const getAllPlansWithStats = async (tx = prisma) => {
  let plans = [];
  try {
    plans = await tx.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: {
            subscriptions: true,
            payments: true,
          },
        },
      },
    });
  } catch (err) {
    console.error("[getAllPlansWithStats] Primary findMany failed:", err.message);
    // If include _count fails due to relation mismatch, fallback to plain findMany
    try {
      plans = await tx.plan.findMany({
        orderBy: { sortOrder: "asc" },
      });
    } catch (secondErr) {
      console.error("[getAllPlansWithStats] Secondary findMany failed:", secondErr.message);
      plans = [];
    }
  }

  // Auto-seed default plans if table is empty
  if (!plans || plans.length === 0) {
    try {
      const { DEFAULT_PLANS } = require("../../scripts/seed-plans");
      for (const plan of DEFAULT_PLANS) {
        await tx.plan.upsert({
          where: { code: plan.code },
          update: {},
          create: plan,
        });
      }
      plans = await tx.plan.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: {
              subscriptions: true,
              payments: true,
            },
          },
        },
      });
    } catch (seedErr) {
      console.warn("[getAllPlansWithStats] Auto-seeding fallback warning:", seedErr.message);
    }
  }

  if (!plans || plans.length === 0) {
    try {
      const { DEFAULT_PLANS } = require("../../scripts/seed-plans");
      plans = DEFAULT_PLANS;
    } catch (_) {}
  }

  // Self-healing: Automatically upgrade DEMO plan from 7-day to 30-day in memory and database
  if (Array.isArray(plans)) {
    for (const p of plans) {
      if (p.code === "DEMO" && (p.durationDays === 7 || (p.description && p.description.includes("7-day")))) {
        p.durationDays = 30;
        p.description = "30-day free trial with standard feature access for evaluation.";
        if (p.id) {
          try {
            await tx.plan.update({
              where: { id: p.id },
              data: {
                durationDays: 30,
                description: "30-day free trial with standard feature access for evaluation.",
              },
            });
          } catch (_) {}
        }
      }
    }
  }

  const now = new Date();

  // Calculate active subscribers count and company details per plan
  const planStats = await Promise.all(
    (plans || []).map(async (p) => {
      let activeSubs = [];
      try {
        const whereOr = [];
        if (p.id) whereOr.push({ planId: p.id });
        if (p.code) whereOr.push({ planCode: p.code });

        activeSubs = await tx.subscription.findMany({
          where: {
            status: SUBSCRIPTION_STATUS.ACTIVE,
            endDate: { gte: now },
            ...(whereOr.length > 0 ? { OR: whereOr } : {}),
          },
          select: {
            id: true,
            companyId: true,
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });
      } catch (subErr) {
        activeSubs = [];
      }

      // Filter unique companies
      const companyMap = new Map();
      for (const sub of activeSubs) {
        if (sub.company && !companyMap.has(sub.companyId)) {
          companyMap.set(sub.companyId, {
            id: sub.company.id,
            name: sub.company.name,
            slug: sub.company.slug,
          });
        }
      }

      const subscriberCompanies = Array.from(companyMap.values());
      const activeSubscribers = subscriberCompanies.length;

      return {
        id: p.id || p.code?.toLowerCase() || `plan-${p.code || "custom"}`,
        code: p.code,
        name: p.name,
        description: p.description,
        monthlyPrice: Number(p.monthlyPrice) || 0,
        yearlyPrice: Number(p.yearlyPrice) || 0,
        currency: p.currency || "INR",
        seatLimit: p.seatLimit,
        candidateLimit: p.candidateLimit,
        inviteLimit: p.inviteLimit,
        durationDays: p.durationDays,
        isTrial: Boolean(p.isTrial),
        isCustom: Boolean(p.isCustom),
        isActive: Boolean(p.isActive !== undefined ? p.isActive : true),
        isPopular: Boolean(p.isPopular),
        sortOrder: p.sortOrder || 0,
        totalSubscriptions: p._count?.subscriptions || 0,
        totalPayments: p._count?.payments || 0,
        activeSubscribers,
        subscriberCount: activeSubscribers,
        subscriberCompanies,
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      };
    })
  );

  return planStats;
};

/**
 * Super Admin: Create a new plan catalog entry.
 */
const createPlan = async (data, tx = prisma) => {
  const {
    code,
    name,
    description,
    monthlyPrice,
    yearlyPrice,
    currency = "INR",
    seatLimit,
    candidateLimit,
    inviteLimit,
    durationDays,
    isTrial = false,
    isCustom = false,
    isActive = true,
    isPopular = false,
    sortOrder = 0,
  } = data;

  const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, "_");

  const existing = await tx.plan.findUnique({
    where: { code: normalizedCode },
  });

  if (existing) {
    throw new AppError(`A plan with code '${normalizedCode}' already exists.`, {
      statusCode: 409,
      code: "PLAN_ALREADY_EXISTS",
      isOperational: true,
    });
  }

  const plan = await tx.plan.create({
    data: {
      code: normalizedCode,
      name: name.trim(),
      description: description?.trim() || null,
      monthlyPrice: Number(monthlyPrice) || 0,
      yearlyPrice: Number(yearlyPrice) || 0,
      currency,
      seatLimit: seatLimit !== undefined && seatLimit !== null && seatLimit !== "" ? parseInt(seatLimit, 10) : null,
      candidateLimit: candidateLimit !== undefined && candidateLimit !== null && candidateLimit !== "" ? parseInt(candidateLimit, 10) : null,
      inviteLimit: inviteLimit !== undefined && inviteLimit !== null && inviteLimit !== "" ? parseInt(inviteLimit, 10) : null,
      durationDays: durationDays ? parseInt(durationDays, 10) : null,
      isTrial: Boolean(isTrial),
      isCustom: Boolean(isCustom),
      isActive: Boolean(isActive),
      isPopular: Boolean(isPopular),
      sortOrder: parseInt(sortOrder, 10) || 0,
    },
  });

  return plan;
};

/**
 * Super Admin: Update plan.
 * Crucial Rule: Leaves existing active subscriptions untouched (preserving original purchase terms).
 */
const updatePlan = async (planId, data, tx = prisma) => {
  let existing = null;
  try {
    existing = await tx.plan.findUnique({
      where: { id: planId },
    });
  } catch (_) {}

  if (!existing) {
    try {
      existing = await tx.plan.findUnique({
        where: { code: planId.toUpperCase() },
      });
    } catch (_) {}
  }

  if (!existing) {
    throw new AppError("Plan not found", {
      statusCode: 404,
      code: PLAN_ERROR_CODES.PLAN_NOT_FOUND,
      isOperational: true,
    });
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.monthlyPrice !== undefined) updateData.monthlyPrice = Number(data.monthlyPrice);
  if (data.yearlyPrice !== undefined) updateData.yearlyPrice = Number(data.yearlyPrice);
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.seatLimit !== undefined) {
    updateData.seatLimit = data.seatLimit !== null && data.seatLimit !== "" ? parseInt(data.seatLimit, 10) : null;
  }
  if (data.candidateLimit !== undefined) {
    updateData.candidateLimit = data.candidateLimit !== null && data.candidateLimit !== "" ? parseInt(data.candidateLimit, 10) : null;
  }
  if (data.inviteLimit !== undefined) {
    updateData.inviteLimit = data.inviteLimit !== null && data.inviteLimit !== "" ? parseInt(data.inviteLimit, 10) : null;
  }
  if (data.durationDays !== undefined) {
    updateData.durationDays = data.durationDays ? parseInt(data.durationDays, 10) : null;
  }
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
  if (data.isPopular !== undefined) updateData.isPopular = Boolean(data.isPopular);
  if (data.sortOrder !== undefined) updateData.sortOrder = parseInt(data.sortOrder, 10) || 0;

  const updatedPlan = await tx.plan.update({
    where: { id: existing.id },
    data: updateData,
  });

  return updatedPlan;
};

/**
 * Super Admin: Toggle Plan status (Activate/Deactivate).
 */
const togglePlanStatus = async (planId, isActive, tx = prisma) => {
  return updatePlan(planId, { isActive }, tx);
};

/**
 * Super Admin: Delete Plan.
 * Rule: Block deletion if plan has active or historical subscriptions.
 */
const deletePlan = async (planId, tx = prisma) => {
  let plan = null;
  try {
    plan = await tx.plan.findUnique({
      where: { id: planId },
      include: {
        _count: {
          select: {
            subscriptions: true,
            payments: true,
          },
        },
      },
    });
  } catch (_) {}

  if (!plan) {
    try {
      plan = await tx.plan.findUnique({
        where: { code: planId.toUpperCase() },
        include: {
          _count: {
            select: {
              subscriptions: true,
              payments: true,
            },
          },
        },
      });
    } catch (_) {}
  }

  if (!plan) {
    throw new AppError("Plan not found", {
      statusCode: 404,
      code: PLAN_ERROR_CODES.PLAN_NOT_FOUND,
      isOperational: true,
    });
  }

  if (plan._count?.subscriptions > 0 || plan._count?.payments > 0) {
    throw new AppError(
      "Cannot delete a plan that is referenced by active or historical subscriptions. Please deactivate the plan instead.",
      {
        statusCode: 409,
        code: PLAN_ERROR_CODES.PLAN_HAS_ACTIVE_SUBSCRIBERS,
        isOperational: true,
      }
    );
  }

  return tx.plan.delete({
    where: { id: plan.id },
  });
};

/**
 * Super Admin manual plan assignment
 */
const assignCompanyPlan = async (companyId, payload, tx = prisma) => {
  const {
    plan,
    planStatus,
    planExpiresAt,
    customSeatLimit,
    customCandidateLimit,
    customInviteLimit,
  } = payload;

  const normalizedPlan = (plan || COMPANY_PLANS.STARTER).toUpperCase();
  const now = new Date();
  let computedExpiresAt = null;
  let computedStatus = planStatus || COMPANY_PLAN_STATUS.ACTIVE;

  if (normalizedPlan === COMPANY_PLANS.DEMO) {
    computedExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    computedStatus = COMPANY_PLAN_STATUS.ACTIVE;
  } else if (planExpiresAt) {
    computedExpiresAt = new Date(planExpiresAt);
  }

  const updateData = {
    plan: normalizedPlan,
    planStatus: computedStatus,
    planStartedAt: now,
    planExpiresAt: computedExpiresAt,
  };

  if (normalizedPlan === COMPANY_PLANS.ENTERPRISE) {
    updateData.customSeatLimit =
      customSeatLimit !== undefined && customSeatLimit !== null && customSeatLimit !== ""
        ? parseInt(customSeatLimit, 10)
        : null;
    updateData.customCandidateLimit =
      customCandidateLimit !== undefined && customCandidateLimit !== null && customCandidateLimit !== ""
        ? parseInt(customCandidateLimit, 10)
        : null;
    updateData.customInviteLimit =
      customInviteLimit !== undefined && customInviteLimit !== null && customInviteLimit !== ""
        ? parseInt(customInviteLimit, 10)
        : null;
  } else {
    updateData.customSeatLimit = null;
    updateData.customCandidateLimit = null;
    updateData.customInviteLimit = null;
  }

  let updatedCompany = null;
  try {
    updatedCompany = await tx.company.update({
      where: { id: companyId },
      data: updateData,
    });
  } catch (colErr) {
    console.warn("[assignCompanyPlan] Plan columns missing, skipped updating columns:", colErr.message);
    updatedCompany = await tx.company.findUnique({ where: { id: companyId } });
  }

  // Keep subscription record synchronized defensively
  try {
    if (computedStatus === COMPANY_PLAN_STATUS.ACTIVE) {
      let catalogPlan = null;
      try {
        catalogPlan = await tx.plan.findUnique({ where: { code: normalizedPlan } });
      } catch (_) {}

      const seatLimit =
        normalizedPlan === COMPANY_PLANS.ENTERPRISE
          ? updateData.customSeatLimit
          : catalogPlan?.seatLimit ?? 2;
      const candidateLimit =
        normalizedPlan === COMPANY_PLANS.ENTERPRISE
          ? updateData.customCandidateLimit
          : catalogPlan?.candidateLimit ?? 100;
      const inviteLimit =
        normalizedPlan === COMPANY_PLANS.ENTERPRISE
          ? updateData.customInviteLimit
          : catalogPlan?.inviteLimit ?? 50;

      await tx.subscription.updateMany({
        where: { companyId, status: SUBSCRIPTION_STATUS.ACTIVE },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: now },
      });

      await tx.subscription.create({
        data: {
          companyId,
          planId: catalogPlan?.id || null,
          planCode: normalizedPlan,
          planName: catalogPlan?.name || `${normalizedPlan} Plan`,
          billingCycle: "MONTHLY",
          status: SUBSCRIPTION_STATUS.ACTIVE,
          isTrial: normalizedPlan === COMPANY_PLANS.DEMO,
          amount: catalogPlan?.monthlyPrice || 0,
          currency: catalogPlan?.currency || "INR",
          seatLimit: seatLimit ?? 2,
          candidateLimit: candidateLimit ?? 100,
          inviteLimit: inviteLimit ?? 50,
          startDate: now,
          endDate: computedExpiresAt || new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    } else {
      // If status is not active (e.g. EXPIRED or SUSPENDED), cancel active subscriptions
      await tx.subscription.updateMany({
        where: { companyId, status: SUBSCRIPTION_STATUS.ACTIVE },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: now },
      });
    }
  } catch (subErr) {
    console.warn("[assignCompanyPlan] Subscription table fallback:", subErr.message);
  }

  return updatedCompany;
};

/**
 * Public onboarding: registers a new company and owner with an active 30-Day Demo Trial.
 * Guaranteed 720 hours duration, strictly single trial per company/email.
 */
const registerDemoCompany = async (payload) => {
  const { companyName, ownerName, ownerEmail, password, industry, website, phone } = payload;

  if (!companyName?.trim()) {
    throw new AppError("Company name is required.", {
      statusCode: 400,
      code: "COMPANY_NAME_REQUIRED",
      isOperational: true,
    });
  }
  if (!ownerName?.trim()) {
    throw new AppError("Owner full name is required.", {
      statusCode: 400,
      code: "OWNER_NAME_REQUIRED",
      isOperational: true,
    });
  }
  if (!ownerEmail?.trim()) {
    throw new AppError("Owner email is required.", {
      statusCode: 400,
      code: "OWNER_EMAIL_REQUIRED",
      isOperational: true,
    });
  }
  if (!password || password.length < 6) {
    throw new AppError("Password must be at least 6 characters long.", {
      statusCode: 400,
      code: "INVALID_PASSWORD_LENGTH",
      isOperational: true,
    });
  }

  const normalizedEmail = ownerEmail.toLowerCase().trim();
  const normalizedCompanyName = companyName.trim();

  // Check uniqueness
  const existingCompany = await prisma.company.findFirst({
    where: { name: { equals: normalizedCompanyName, mode: "insensitive" } },
  });
  if (existingCompany) {
    throw new AppError("A company with this name is already registered.", {
      statusCode: 409,
      code: "COMPANY_ALREADY_EXISTS",
      isOperational: true,
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    throw new AppError("An account with this email is already registered.", {
      statusCode: 409,
      code: "EMAIL_ALREADY_EXISTS",
      isOperational: true,
    });
  }

  const demoCatalogPlan = await prisma.plan.findUnique({ where: { code: COMPANY_PLANS.DEMO } }).catch(() => null);
  const durationDays = demoCatalogPlan?.durationDays || 30;
  const hashedPassword = await hashPassword(password);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000); // 30 days (720 hours)

  // Unique slug generation
  const baseSlug =
    normalizedCompanyName
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `company-${Date.now()}`;

  let slug = baseSlug;
  const existingSlug = await prisma.company.findUnique({ where: { slug: baseSlug } });
  if (existingSlug) {
    slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create company safely
    let company;
    try {
      company = await tx.company.create({
        data: {
          name: normalizedCompanyName,
          slug,
          website: website?.trim() || null,
          industry: industry?.trim() || null,
          phone: phone?.trim() || null,
          plan: COMPANY_PLANS.DEMO,
          planStatus: COMPANY_PLAN_STATUS.ACTIVE,
          hasUsedDemo: true,
          planStartedAt: now,
          planExpiresAt: expiresAt,
        },
      });
    } catch (createErr) {
      // Fallback if unmigrated plan columns do not exist in the database table
      company = await tx.company.create({
        data: {
          name: normalizedCompanyName,
          slug,
          website: website?.trim() || null,
          industry: industry?.trim() || null,
          phone: phone?.trim() || null,
          status: "ACTIVE",
        },
      });
    }

    // 2. Create Owner user
    const user = await tx.user.create({
      data: {
        name: ownerName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        status: "ACTIVE",
        role: "HR",
      },
    });

    // 3. Create Company Member (Role: OWNER)
    await tx.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    // 4. Create active Demo subscription snapshot
    let subscription = null;
    try {
      const demoPlan = await tx.plan.findUnique({ where: { code: COMPANY_PLANS.DEMO } });
      subscription = await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: demoPlan?.id || null,
          planCode: COMPANY_PLANS.DEMO,
          planName: "Demo Trial",
          billingCycle: "MONTHLY",
          status: SUBSCRIPTION_STATUS.ACTIVE,
          isTrial: true,
          amount: 0,
          currency: "INR",
          seatLimit: 2,
          candidateLimit: 20,
          inviteLimit: 10,
          startDate: now,
          endDate: expiresAt,
        },
      });
    } catch (subErr) {
      console.warn("[registerDemoCompany] Subscription snapshot creation warning:", subErr.message);
    }

    return { company, user, subscription };
  });

  // Generate tokens
  const accessToken = generateAccessToken(result.user, result.company.id);
  const refreshToken = generateRefreshToken(result.user);

  try {
    const authRepository = require("../auth/auth.repository");
    if (authRepository.createRefreshToken) {
      await authRepository.createRefreshToken(result.user.id, hashToken(refreshToken), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    }
  } catch (_) {}

  const tenantUrl = buildCompanyTenantUrl(result.company, "/login");

  return {
    message: "Company registered successfully with 30-Day Free Demo Trial!",
    tenantUrl,
    company: {
      id: result.company.id,
      name: result.company.name,
      slug: result.company.slug,
      plan: result.company.plan,
      planExpiresAt: result.company.planExpiresAt,
    },
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: "OWNER",
    },
    accessToken,
    refreshToken,
  };
};

module.exports = {
  getEffectivePlanLimits,
  checkCompanyPlanStatus,
  assertCompanyPlanActive,
  getCompanyUsage,
  assertCanAddHrSeat,
  assertCanAddCandidates,
  assertCanSendInvitations,
  assignCompanyPlan,
  startDemoTrial,
  registerDemoCompany,
  getActivePlans,
  getAllPlansWithStats,
  createPlan,
  updatePlan,
  togglePlanStatus,
  deletePlan,
};
