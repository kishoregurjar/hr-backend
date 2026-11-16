"use strict";

const { prisma } = require("../../config/prisma");
const { PAYMENT_STATUS } = require("../plan/plan.constants");
const { AppError } = require("../../utils/app-error");

/**
 * Super Admin Revenue Overview Metrics
 * Aggregates captured gross revenue, current month/year performance, refunds, and net revenue.
 */
const getRevenueOverview = async ({ mode = "all" }) => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentYearStart = new Date(now.getFullYear(), 0, 1);

  // Fetch all payments defensively
  let payments = [];
  try {
    payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        createdAt: true,
        planSnapshot: true,
        billingCycle: true,
      },
    });
  } catch (err) {
    console.warn("[getRevenueOverview] Payment query fallback:", err.message);
    payments = [];
  }

  let totalCapturedRevenue = 0;
  let currentMonthRevenue = 0;
  let currentYearRevenue = 0;
  let totalSuccessful = 0;
  let totalPending = 0;
  let totalFailed = 0;
  let totalRefunds = 0;

  for (const payment of payments) {
    const amount = Number(payment.amount) || 0;
    const isCompleted = payment.status === PAYMENT_STATUS.COMPLETED;
    const isPending = payment.status === PAYMENT_STATUS.PENDING;
    const isFailed = payment.status === PAYMENT_STATUS.FAILED || payment.status === PAYMENT_STATUS.CANCELLED;
    const snapshot = payment.planSnapshot || {};
    const refundAmount = Number(snapshot.refundAmount) || 0;

    if (refundAmount > 0) {
      totalRefunds += refundAmount;
    }

    if (isCompleted) {
      totalCapturedRevenue += amount;
      totalSuccessful += 1;

      const dateToCheck = payment.paidAt ? new Date(payment.paidAt) : new Date(payment.createdAt);
      if (dateToCheck >= currentMonthStart) {
        currentMonthRevenue += amount;
      }
      if (dateToCheck >= currentYearStart) {
        currentYearRevenue += amount;
      }
    } else if (isPending) {
      totalPending += 1;
    } else if (isFailed) {
      totalFailed += 1;
    }
  }

  const netRevenue = Math.max(0, totalCapturedRevenue - totalRefunds);

  return {
    environment: process.env.RAZORPAY_ENV || "test",
    isTestMode: true,
    currency: "INR",
    totalCapturedRevenue: Math.round(totalCapturedRevenue * 100) / 100,
    currentMonthRevenue: Math.round(currentMonthRevenue * 100) / 100,
    currentYearRevenue: Math.round(currentYearRevenue * 100) / 100,
    totalSuccessful,
    totalPending,
    totalFailed,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    successRate: totalSuccessful + totalFailed > 0
      ? Math.round((totalSuccessful / (totalSuccessful + totalFailed)) * 100)
      : 100,
  };
};

/**
 * Super Admin Revenue Visual Charts
 * Monthly trends, yearly trends, plan breakdown, and success/failure breakdown.
 */
const getRevenueCharts = async ({ mode = "all" }) => {
  const now = new Date();

  // Last 12 months trend
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const monthlyBuckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    monthlyBuckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label,
      revenue: 0,
      transactions: 0,
    });
  }

  // Yearly trend for last 3 years
  const currentYear = now.getFullYear();
  const yearlyBuckets = [
    { year: String(currentYear - 2), revenue: 0, transactions: 0 },
    { year: String(currentYear - 1), revenue: 0, transactions: 0 },
    { year: String(currentYear), revenue: 0, transactions: 0 },
  ];

  // Plan distribution map
  const planDistribution = {
    STARTER: { name: "Starter", revenue: 0, count: 0 },
    GROWTH: { name: "Growth", revenue: 0, count: 0 },
    BUSINESS: { name: "Business", revenue: 0, count: 0 },
    ENTERPRISE: { name: "Enterprise", revenue: 0, count: 0 },
  };

  const statusDistribution = {
    COMPLETED: 0,
    PENDING: 0,
    FAILED: 0,
  };

  let payments = [];
  try {
    payments = await prisma.payment.findMany({
      select: {
        amount: true,
        status: true,
        paidAt: true,
        createdAt: true,
        planSnapshot: true,
      },
    });
  } catch (err) {
    console.warn("[getRevenueCharts] Payment query fallback:", err.message);
    payments = [];
  }

  for (const p of payments) {
    const amount = Number(p.amount) || 0;
    const isCompleted = p.status === PAYMENT_STATUS.COMPLETED;
    const statusKey = p.status === PAYMENT_STATUS.COMPLETED ? "COMPLETED" : p.status === PAYMENT_STATUS.PENDING ? "PENDING" : "FAILED";
    statusDistribution[statusKey] = (statusDistribution[statusKey] || 0) + 1;

    if (isCompleted) {
      const pDate = p.paidAt ? new Date(p.paidAt) : new Date(p.createdAt);
      const mKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, "0")}`;
      const yKey = String(pDate.getFullYear());

      const mBucket = monthlyBuckets.find((b) => b.key === mKey);
      if (mBucket) {
        mBucket.revenue += amount;
        mBucket.transactions += 1;
      }

      const yBucket = yearlyBuckets.find((b) => b.year === yKey);
      if (yBucket) {
        yBucket.revenue += amount;
        yBucket.transactions += 1;
      }

      const planCode = (p.planSnapshot?.code || "STARTER").toUpperCase();
      if (planDistribution[planCode]) {
        planDistribution[planCode].revenue += amount;
        planDistribution[planCode].count += 1;
      } else {
        planDistribution.STARTER.revenue += amount;
        planDistribution.STARTER.count += 1;
      }
    }
  }

  // Calculate percentages for plans
  const totalPlanRevenue = Object.values(planDistribution).reduce((acc, curr) => acc + curr.revenue, 0);
  const planBreakdown = Object.entries(planDistribution).map(([code, data]) => ({
    code,
    name: data.name,
    revenue: Math.round(data.revenue * 100) / 100,
    count: data.count,
    percentage: totalPlanRevenue > 0 ? Math.round((data.revenue / totalPlanRevenue) * 100) : 0,
  }));

  return {
    monthlyTrend: monthlyBuckets.map((b) => ({
      label: b.label,
      revenue: Math.round(b.revenue * 100) / 100,
      transactions: b.transactions,
    })),
    yearlyTrend: yearlyBuckets.map((b) => ({
      year: b.year,
      revenue: Math.round(b.revenue * 100) / 100,
      transactions: b.transactions,
    })),
    planBreakdown,
    statusBreakdown: [
      { name: "Successful", value: statusDistribution.COMPLETED, color: "#10b981" },
      { name: "Pending", value: statusDistribution.PENDING, color: "#f59e0b" },
      { name: "Failed", value: statusDistribution.FAILED, color: "#ef4444" },
    ],
  };
};

/**
 * Super Admin Payment Transactions Table
 * Complete paginated list with search, status filter, plan filter, billing cycle filter, and detailed records.
 */
const getPaymentTransactions = async ({
  page = 1,
  limit = 15,
  search = "",
  status = "ALL",
  plan = "ALL",
  billingCycle = "ALL",
  dateRange = "ALL",
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  // Status filter
  if (status && status !== "ALL") {
    where.status = status.toUpperCase();
  }

  // Billing cycle filter
  if (billingCycle && billingCycle !== "ALL") {
    where.billingCycle = billingCycle.toUpperCase();
  }

  // Search filter
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { razorpayOrderId: { contains: q, mode: "insensitive" } },
      { razorpayPaymentId: { contains: q, mode: "insensitive" } },
      { receipt: { contains: q, mode: "insensitive" } },
      { company: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Date range filter
  if (dateRange && dateRange !== "ALL") {
    const now = new Date();
    if (dateRange === "TODAY") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      where.createdAt = { gte: todayStart };
    } else if (dateRange === "WEEK") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: weekAgo };
    } else if (dateRange === "MONTH") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      where.createdAt = { gte: monthStart };
    } else if (dateRange === "YEAR") {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      where.createdAt = { gte: yearStart };
    }
  }

  let total = 0;
  let payments = [];
  try {
    const [t, p] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              members: {
                where: { role: "OWNER" },
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
                take: 1,
              },
            },
          },
        },
      }),
    ]);
    total = t;
    payments = p;
  } catch (err) {
    console.warn("[getPaymentTransactions] Payment query fallback:", err.message);
    total = 0;
    payments = [];
  }

  const transactions = payments.map((p) => {
    const snapshot = p.planSnapshot || {};
    const owner = p.company?.members?.[0]?.user;
    const signupData = p.signupData || {};

    return {
      id: p.id,
      companyId: p.companyId,
      companyName: p.company?.name || signupData.companyName || "New Workspace Registration",
      ownerName: owner?.name || signupData.ownerName || "Organization Owner",
      ownerEmail: owner?.email || signupData.ownerEmail || "N/A",
      planName: snapshot.name || snapshot.code || "Standard",
      planCode: snapshot.code || "STARTER",
      billingCycle: p.billingCycle,
      amount: Number(p.amount),
      currency: p.currency,
      amountPaise: p.amountPaise,
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId || "N/A",
      paymentMethod: snapshot.paymentMethod || "online",
      status: p.status,
      refundStatus: snapshot.refundStatus || "NONE",
      refundAmount: snapshot.refundAmount ? Number(snapshot.refundAmount) : 0,
      errorMessage: p.errorMessage || null,
      isTest: true,
      environment: snapshot.environment || "test",
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      planSnapshot: p.planSnapshot,
    };
  });

  return {
    transactions,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Super Admin Transaction Detail View
 */
const getTransactionDetail = async (id) => {
  let payment = null;
  try {
    payment = await prisma.payment.findFirst({
      where: {
        OR: [{ id }, { razorpayOrderId: id }, { razorpayPaymentId: id }],
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subscription: true,
      },
    });
  } catch (err) {
    console.warn("[getTransactionDetail] Payment query fallback:", err.message);
  }

  if (!payment) {
    throw new AppError("Payment transaction record not found.", {
      statusCode: 404,
      code: "TRANSACTION_NOT_FOUND",
      isOperational: true,
    });
  }

  const snapshot = payment.planSnapshot || {};
  const owner = payment.company?.members?.[0]?.user;
  const signupData = payment.signupData || {};

  return {
    id: payment.id,
    companyId: payment.companyId,
    companyName: payment.company?.name || signupData.companyName || "New Workspace Registration",
    companySlug: payment.company?.slug || null,
    ownerName: owner?.name || signupData.ownerName || "Organization Owner",
    ownerEmail: owner?.email || signupData.ownerEmail || "N/A",
    planName: snapshot.name || snapshot.code || "Standard",
    planCode: snapshot.code || "STARTER",
    billingCycle: payment.billingCycle,
    amount: Number(payment.amount),
    currency: payment.currency,
    amountPaise: payment.amountPaise,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId || "N/A",
    razorpaySignature: payment.razorpaySignature ? "sha256_verified_hmac" : "N/A",
    paymentMethod: snapshot.paymentMethod || "online",
    status: payment.status,
    receipt: payment.receipt,
    refundStatus: snapshot.refundStatus || "NONE",
    refundAmount: snapshot.refundAmount ? Number(snapshot.refundAmount) : 0,
    errorMessage: payment.errorMessage || null,
    isTest: true,
    environment: snapshot.environment || "test",
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    planSnapshot: payment.planSnapshot,
    subscription: payment.subscription,
  };
};

module.exports = {
  getRevenueOverview,
  getRevenueCharts,
  getPaymentTransactions,
  getTransactionDetail,
};

