"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Get aggregated dashboard statistics in a single parallel query batch
 */
async function getDashboardOverviewData({ userId, companyId }, db = prisma) {
  // 1. Fetch assessments created by the user first to obtain valid assessment IDs
  const userAssessments = userId
    ? await db.assessment.findMany({
        where: { createdById: userId },
        select: { id: true, status: true },
      })
    : [];

  const assessmentIds = userAssessments.map((a) => a.id);
  const totalAssessments = userAssessments.length;
  const activeAssessments = userAssessments.filter(
    (a) => a.status === "ACTIVE" || a.status === "PUBLISHED"
  ).length;

  // 2. Fetch user's connected mailbox to scope email parsed resumes
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

  // 3. Parallel query execution with 100% valid Prisma where clauses
  const [
    totalCandidates,
    parsedResumesCount,
    totalInvitations,
    pendingInvitations,
    completedInvitations,
    totalAttempts,
    inProgressAttempts,
    submittedAttempts,
    recentCandidates,
  ] = await Promise.all([
    // Total Candidates (Strictly filtered by companyId)
    companyId ? db.candidateProfile.count({ where: { companyId } }) : 0,

    // Parsed Resumes Count (Scoped to user's connected mailbox)
    userMailbox?.email
      ? db.inboundEmailEvent.count({
          where: {
            recipientEmail: userMailbox.email,
            status: "COMPLETED",
          },
        })
      : 0,

    // Total Assessment Invitations
    assessmentIds.length > 0
      ? db.invitation.count({
          where: { assessmentId: { in: assessmentIds } },
        })
      : 0,

    // Pending Invitations
    assessmentIds.length > 0
      ? db.invitation.count({
          where: {
            assessmentId: { in: assessmentIds },
            status: "PENDING",
          },
        })
      : 0,

    // Completed Invitations (Valid InvitationStatus enum: COMPLETED)
    assessmentIds.length > 0
      ? db.invitation.count({
          where: {
            assessmentId: { in: assessmentIds },
            status: "COMPLETED",
          },
        })
      : 0,

    // Total Attempts
    assessmentIds.length > 0
      ? db.candidateAttempt.count({
          where: { assessmentId: { in: assessmentIds } },
        })
      : 0,

    // In Progress Attempts (Valid CandidateAssessmentStatus enum: IN_PROGRESS)
    assessmentIds.length > 0
      ? db.candidateAttempt.count({
          where: {
            assessmentId: { in: assessmentIds },
            status: "IN_PROGRESS",
          },
        })
      : 0,

    // Submitted Attempts (Valid CandidateAssessmentStatus enum: SUBMITTED)
    assessmentIds.length > 0
      ? db.candidateAttempt.count({
          where: {
            assessmentId: { in: assessmentIds },
            status: "SUBMITTED",
          },
        })
      : 0,

    // Recent Candidates (Strictly filtered by companyId)
    companyId
      ? db.candidateProfile.findMany({
          where: { companyId },
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
        })
      : [],
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

