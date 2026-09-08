"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Get aggregated dashboard statistics in a single parallel query batch
 */
async function getDashboardOverviewData({ userId, companyId }, db = prisma) {
  const candidateWhere = companyId ? { companyId } : {};

  const [
    totalCandidates,
    parsedResumesCount,
    totalAssessments,
    activeAssessments,
    totalInvitations,
    pendingInvitations,
    completedInvitations,
    totalAttempts,
    inProgressAttempts,
    submittedAttempts,
    userMailbox,
    recentCandidates,
  ] = await Promise.all([
    // 1. Total Candidates (filtered by companyId if present)
    db.candidateProfile.count({
      where: candidateWhere,
    }),

    // 2. Parsed Resumes Count
    db.inboundEmailEvent.count({
      where: { status: "COMPLETED" },
    }),

    // 3. Total Assessments
    db.assessment.count(),

    // 4. Active/Published Assessments
    db.assessment.count({
      where: {
        status: { in: ["ACTIVE", "PUBLISHED"] },
      },
    }),

    // 5. Total Assessment Invitations
    db.invitation.count(),

    // 6. Pending Invitations
    db.invitation.count({
      where: { status: "PENDING" },
    }),

    // 7. Completed Invitations
    db.invitation.count({
      where: { status: "COMPLETED" },
    }),

    // 8. Total Attempts
    db.candidateAttempt.count(),

    // 9. In Progress Attempts
    db.candidateAttempt.count({
      where: { status: "IN_PROGRESS" },
    }),

    // 10. Submitted Attempts
    db.candidateAttempt.count({
      where: { status: "SUBMITTED" },
    }),

    // 11. User Mailbox Connection Status
    userId
      ? db.userMailbox.findUnique({
          where: { userId },
          select: {
            email: true,
            isSyncActive: true,
            lastSyncedAt: true,
            lastError: true,
          },
        })
      : null,

    // 12. Recent Candidates (filtered by companyId if present)
    db.candidateProfile.findMany({
      where: candidateWhere,
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    candidates: {
      total: totalCandidates,
      parsedFromEmail: parsedResumesCount,
    },
    assessments: {
      total: totalAssessments,
      active: activeAssessments,
    },
    invitations: {
      total: totalInvitations,
      pending: pendingInvitations,
      completed: completedInvitations,
    },
    attempts: {
      total: totalAttempts,
      inProgress: inProgressAttempts,
      submitted: submittedAttempts,
    },
    mailbox: {
      isConnected: Boolean(userMailbox && userMailbox.email),
      email: userMailbox?.email || null,
      isSyncActive: userMailbox?.isSyncActive || false,
      lastSyncedAt: userMailbox?.lastSyncedAt || null,
      lastError: userMailbox?.lastError || null,
    },
    recentCandidates,
  };
}

module.exports = {
  getDashboardOverviewData,
};
