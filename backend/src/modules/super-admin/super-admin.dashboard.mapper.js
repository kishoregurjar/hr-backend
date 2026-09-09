"use strict";

const mapPlatformStatistics = (statistics) => ({
  companies: {
    total: statistics.totalCompanies,
    active: statistics.activeCompanies,
    suspended: statistics.suspendedCompanies,
  },

  members: {
    total: statistics.totalMembers,
  },

  jobs: {
    total: statistics.totalJobs,
  },

  invitations: {
    pending: statistics.pendingInvitations,
  },

  ownerActivations: {
    pending: statistics.pendingOwnerActivations,
  },
});

const mapCompanyStatistics = (statistics) => ({
  company: {
    id: statistics.company.id,
    name: statistics.company.name,
    slug: statistics.company.slug,
    status: statistics.company.status,
    createdAt: statistics.company.createdAt,
  },

  members: {
    total: statistics.memberCount,
    active: statistics.activeMemberCount,
  },

  jobs: {
    total: statistics.totalJobCount,
    active: statistics.activeJobCount,
  },

  invitations: {
    pending: statistics.pendingInvitationCount,
  },

  ownerActivation: statistics.ownerActivation
    ? {
        status: statistics.ownerActivation.status,
        expiresAt: statistics.ownerActivation.expiresAt,
      }
    : null,
});

module.exports = {
  mapPlatformStatistics,
  mapCompanyStatistics,
};
