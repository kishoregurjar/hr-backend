"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Get aggregated dashboard statistics in a single parallel query batch
 */
async function getDashboardOverviewData({ userId, companyId }, db = prisma) {
  // If companyId is not found, scope to a non-existent company to prevent global data leak
  const candidateWhere = companyId
    ? { companyId }
    : { id: "no-matching-company" };

  const assessmentWhere = userId
    ? { createdById: userId }
    : { id: "no-matching-assessment" };

  const invitationWhere = userId
    ? { assessment: { createdById: userId } }
    : { id: "no-matching-invitation" };

  const attemptWhere = userId
    ? { assessment: { createdById: userId } }
    : { id: "no-matching-attempt" };

  // Fetch user's connected mailbox first to scope email parsed resumes
  const userMailbox = userId
    ? await db.userMailbox.findUnique({
        where: { userId },
        select: {
          email: true,
          isSyncActive: true,
          lastSyncedAt: true,
          lastError: true,
        },
      })
    : null;

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
    recentCandidates,
  ] = await Promise.all([
    // 1. Total Candidates (Strictly filtered by companyId)
    db.candidateProfile.count({
      where: candidateWhere,
    }),

    // 2. Parsed Resumes Count (Scoped to user's connected mailbox)
    userMailbox?.email
      ? db.inboundEmailEvent.count({
          where: {
            recipientEmail: userMailbox.email,
            status: "COMPLETED",
          },
        })
      : 0,

    // 3. Total Assessments (Strictly filtered by user's company/createdById)
    db.assessment.count({
      where: assessmentWhere,
    }),

    // 4. Active/Published Assessments
    db.assessment.count({
      where: {
        ...assessmentWhere,
        status: { in: ["ACTIVE", "PUBLISHED"] },
      },
    }),

    // 5. Total Assessment Invitations
    db.invitation.count({
      where: invitationWhere,
    }),

    // 6. Pending Invitations
    db.invitation.count({
      where: {
        ...invitationWhere,
        status: "PENDING",
      },
    }),

    // 7. Completed Invitations
    db.invitation.count({
      where: {
        ...invitationWhere,
        status: { in: ["COMPLETED", "SUBMITTED"] },
      },
    }),

    // 8. Total Attempts
    db.candidateAttempt.count({
      where: attemptWhere,
    }),

    // 9. In Progress Attempts
    db.candidateAttempt.count({
      where: {
        ...attemptWhere,
        status: "IN_PROGRESS",
      },
    }),

    // 10. Submitted Attempts
    db.candidateAttempt.count({
      where: {
        ...attemptWhere,
        status: "SUBMITTED",
      },
    }),

    // 11. Recent Candidates (Strictly filtered by companyId)
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
