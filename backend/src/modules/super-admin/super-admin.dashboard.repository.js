"use strict";

const { prisma } = require("../../config/prisma");

const getPlatformStatistics = async (tx = prisma) => {
  const now = new Date();
  const [
    companyCounts,
    totalMembers,
    totalJobs,
    pendingInvitations,
    pendingOwnerActivations,
  ] = await Promise.all([
    tx.company.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    tx.companyMember.count(),
    tx.job.count({
      where: {
        companyId: {
          not: null,
        },
      },
    }),
    tx.companyInvitation.count({
      where: {
        status: "PENDING",
        expiresAt: {
          gt: now,
        },
      },
    }),
    tx.companyOwnerActivation.count({
      where: {
        status: "PENDING",
        expiresAt: {
          gt: now,
        },
      },
    }),
  ]);

  let totalCompanies = 0;
  let activeCompanies = 0;
  let suspendedCompanies = 0;

  for (const group of companyCounts) {
    const count = Number(group._count?.id || 0);
    totalCompanies += count;
    if (group.status === "ACTIVE") activeCompanies += count;
    if (group.status === "SUSPENDED") suspendedCompanies += count;
  }

  return {
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    totalMembers,
    totalJobs,
    pendingInvitations,
    pendingOwnerActivations,
  };
};

const getCompanyStatistics = async (companyId, tx = prisma) => {
  const [
    company,
    memberCount,
    activeMemberCount,
    pendingInvitationCount,
    activeJobCount,
    totalJobCount,
    ownerActivation,
  ] = await Promise.all([
    tx.company.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    }),

    tx.companyMember.count({
      where: {
        companyId,
      },
    }),

    tx.companyMember.count({
      where: {
        companyId,
        user: {
          status: "ACTIVE",
        },
      },
    }),

    tx.companyInvitation.count({
      where: {
        companyId,
        status: "PENDING",
        expiresAt: {
          gt: new Date(),
        },
      },
    }),

    tx.job.count({
      where: {
        companyId,
        status: "OPEN",
      },
    }),

    tx.job.count({
      where: {
        companyId,
      },
    }),

    tx.companyOwnerActivation.findFirst({
      where: {
        user: {
          companyMembers: {
            some: {
              companyId,
              role: "OWNER",
            },
          },
        },
      },
      select: {
        status: true,
        expiresAt: true,
      },
    }),
  ]);

  return {
    company,
    memberCount,
    activeMemberCount,
    pendingInvitationCount,
    activeJobCount,
    totalJobCount,
    ownerActivation,
  };
};

module.exports = {
  getPlatformStatistics,
  getCompanyStatistics,
};
