"use strict";

const { prisma } = require("../config/prisma");

const DEFAULT_PLANS = [
  {
    code: "DEMO",
    name: "Demo Plan",
    description: "30-day free trial with standard feature access for evaluation.",
    monthlyPrice: 0.00,
    yearlyPrice: 0.00,
    currency: "INR",
    seatLimit: 2,
    candidateLimit: 20,
    inviteLimit: 10,
    durationDays: 30,
    isTrial: true,
    isCustom: false,
    isActive: true,
    isPopular: false,
    sortOrder: 1,
  },
  {
    code: "STARTER",
    name: "Starter Plan",
    description: "Essential workspace capacity for growing recruitment teams.",
    monthlyPrice: 499.00,
    yearlyPrice: 4990.00,
    currency: "INR",
    seatLimit: 2,
    candidateLimit: 200,
    inviteLimit: 50,
    durationDays: null,
    isTrial: false,
    isCustom: false,
    isActive: true,
    isPopular: false,
    sortOrder: 2,
  },
  {
    code: "GROWTH",
    name: "Growth Plan",
    description: "Comprehensive recruitment engine for expanding talent teams.",
    monthlyPrice: 999.00,
    yearlyPrice: 9990.00,
    currency: "INR",
    seatLimit: 5,
    candidateLimit: 1000,
    inviteLimit: 300,
    durationDays: null,
    isTrial: false,
    isCustom: false,
    isActive: true,
    isPopular: true,
    sortOrder: 3,
  },
  {
    code: "BUSINESS",
    name: "Business Plan",
    description: "High-volume recruitment power with generous quota limits.",
    monthlyPrice: 2499.00,
    yearlyPrice: 24990.00,
    currency: "INR",
    seatLimit: 15,
    candidateLimit: 5000,
    inviteLimit: 1000,
    durationDays: null,
    isTrial: false,
    isCustom: false,
    isActive: true,
    isPopular: false,
    sortOrder: 4,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise Plan",
    description: "Custom limits and dedicated platform capacity tailored to your enterprise.",
    monthlyPrice: 0.00,
    yearlyPrice: 0.00,
    currency: "INR",
    seatLimit: null,
    candidateLimit: null,
    inviteLimit: null,
    durationDays: null,
    isTrial: false,
    isCustom: true,
    isActive: true,
    isPopular: false,
    sortOrder: 5,
  },
];

async function seedPlans() {
  console.log("Seeding default SaaS subscription plans...");

  for (const plan of DEFAULT_PLANS) {
    const existing = await prisma.plan.findUnique({
      where: { code: plan.code },
    });

    if (!existing) {
      await prisma.plan.create({
        data: plan,
      });
      console.log(`Created plan: ${plan.code}`);
    } else {
      console.log(`Plan ${plan.code} already exists.`);
    }
  }

  console.log("Plans seeding completed successfully.");
}

if (require.main === module) {
  seedPlans()
    .catch((err) => {
      console.error("Failed to seed plans:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedPlans, DEFAULT_PLANS };

