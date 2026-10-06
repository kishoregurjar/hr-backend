"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Fetch raw platform-wide analytics database metrics using Prisma aggregations.
 * Supports date range filtering on activity metrics.
 */
const getPlatformAnalyticsMetrics = async ({ startDate = null, endDate = null } = {}, tx = prisma) => {
  // Date filter condition for CandidateAttempt activity
  const attemptDateWhere = {};
  if (startDate && endDate) {
    attemptDateWhere.startedAt = {
      gte: startDate,
      lte: endDate,
    };
  }

  const submittedDateWhere = {
    status: "SUBMITTED",
    ...attemptDateWhere,
  };

  const [
    totalCompanies,
    assessedCandidatesGroups,
    testsCompleted,
    totalStartedAttempts,
    avgScoreAggregate,
    activeJobs,
    totalAssessmentsCreated,
    games,
  ] = await Promise.all([
    // 1. Snapshot: Total Active Companies
    tx.company.count({
      where: {
        status: "ACTIVE",
      },
    }),

    // 2. Date-filtered: Unique Assessed Candidates
    tx.candidateAttempt.groupBy({
      by: ["candidateId"],
      where: {
        status: {
          in: ["IN_PROGRESS", "SUBMITTED", "EXPIRED"],
        },
        ...attemptDateWhere,
      },
    }),

    // 3. Date-filtered: Tests Completed
    tx.candidateAttempt.count({
      where: submittedDateWhere,
    }),

    // 4. Date-filtered: Total Started Attempts (for completion rate calculation)
    tx.candidateAttempt.count({
      where: {
        status: {
          in: ["IN_PROGRESS", "SUBMITTED", "EXPIRED"],
        },
        ...attemptDateWhere,
      },
    }),

    // 5. Date-filtered: Average Percentage Score of Completed Attempts
    tx.candidateAttempt.aggregate({
      _avg: {
        percentage: true,
      },
      where: {
        ...submittedDateWhere,
        percentage: {
          not: null,
        },
      },
    }),

    // 6. Snapshot: Active Jobs
    tx.job.count({
      where: {
        status: "OPEN",
        deletedAt: null,
      },
    }),

    // 7. Snapshot: Total Assessments Created
    tx.assessment.count(),

    // 8. Games Catalog with Usage Counts
    tx.game.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        isActive: true,
        _count: {
          select: {
            attempts: true,
            assessments: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  return {
    totalCompanies,
    assessedCandidates: assessedCandidatesGroups.length,
    testsCompleted,
    totalStartedAttempts,
    rawAvgPercentage: avgScoreAggregate._avg.percentage,
    activeJobs,
    totalAssessmentsCreated,
    games,
  };
};

/**
 * Fetch raw time-series trends grouped by YYYY-MM-DD
 */
const getPlatformAnalyticsTrends = async ({ startDate = null, endDate = null } = {}, tx = prisma) => {
  let startedByDate = [];
  let submittedByDate = [];

  if (startDate && endDate) {
    startedByDate = await tx.$queryRaw`
      SELECT 
        TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
        COUNT(DISTINCT "candidateId")::int AS "startedCandidates",
        COUNT("id")::int AS "startedAttempts"
      FROM "CandidateAttempt"
      WHERE "startedAt" >= ${startDate} AND "startedAt" <= ${endDate}
      GROUP BY TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY "date" ASC
    `;

    submittedByDate = await tx.$queryRaw`
      SELECT 
        TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
        COUNT("id")::int AS "submittedAttempts",
        AVG("percentage")::float AS "avgScore"
      FROM "CandidateAttempt"
      WHERE "status" = 'SUBMITTED' AND "startedAt" >= ${startDate} AND "startedAt" <= ${endDate}
      GROUP BY TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY "date" ASC
    `;
  } else {
    startedByDate = await tx.$queryRaw`
      SELECT 
        TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
        COUNT(DISTINCT "candidateId")::int AS "startedCandidates",
        COUNT("id")::int AS "startedAttempts"
      FROM "CandidateAttempt"
      GROUP BY TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY "date" ASC
    `;

    submittedByDate = await tx.$queryRaw`
      SELECT 
        TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
        COUNT("id")::int AS "submittedAttempts",
        AVG("percentage")::float AS "avgScore"
      FROM "CandidateAttempt"
      WHERE "status" = 'SUBMITTED'
      GROUP BY TO_CHAR("startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY "date" ASC
    `;
  }

  return {
    startedByDate,
    submittedByDate,
  };
};

module.exports = {
  getPlatformAnalyticsMetrics,
  getPlatformAnalyticsTrends,
};
