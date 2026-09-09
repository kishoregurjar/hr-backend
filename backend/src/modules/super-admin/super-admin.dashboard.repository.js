"use strict";

const { prisma } = require("../../config/prisma");

const getPlatformStatistics = async (tx = prisma) => {
  const [
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    totalMembers,
    totalJobs,
    pendingInvitations,
    pendingOwnerActivations,
  ] = await Promise.all([
    tx.company.count(),

    tx.company.count({
      where: {
        status: "ACTIVE",
      },
    }),

    tx.company.count({
      where: {
        status: "SUSPENDED",
      },
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
          gt: new Date(),
        },
      },
    }),

    tx.companyOwnerActivation.count({
      where: {
        status: "PENDING",
        expiresAt: {
          gt: new Date(),
        },
      },
    }),
  ]);

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
