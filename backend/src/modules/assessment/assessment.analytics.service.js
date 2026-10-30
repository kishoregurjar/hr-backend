"use strict";

const { AppError } = require("../../utils/app-error");
const { ASSESSMENT_ANALYTICS_CONSTANTS } = require("./assessment.analytics.constants");
const repository = require("./assessment.analytics.repository");
const {
  mapOverview,
  mapDistribution,
  mapGameAnalytics,
  mapQuestionAnalytics,
} = require("./assessment.analytics.mapper");

function assertAssessmentAccess(user) {
  if (!user) {
    throw new AppError("Authentication is required.", {
      statusCode: 401,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ANALYTICS_ACCESS_DENIED,
    });
  }

  if (user.role !== "HR" && user.role !== "SUPER_ADMIN") {
    throw new AppError(
      "You are not authorized to access assessment analytics.",
      {
        statusCode: 403,
        code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ANALYTICS_ACCESS_DENIED,
      }
    );
  }
}

const { prisma } = require("../../config/prisma");

async function assertAssessmentObjectAccess(assessment, user, companyId) {
  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ASSESSMENT_NOT_FOUND,
    });
  }

  if (assessment.isQuarantined && user.role !== "SUPER_ADMIN") {
    throw new AppError("Assessment is temporarily quarantined under administrative review.", {
      statusCode: 403,
      code: "ASSESSMENT_QUARANTINED",
    });
  }

  if (user.role !== "SUPER_ADMIN") {
    if (assessment.companyId) {
      if (!companyId || assessment.companyId !== companyId) {
        throw new AppError("You do not have access to this assessment.", {
          statusCode: 403,
          code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ANALYTICS_ACCESS_DENIED,
        });
      }
    } else {
      // Legacy unassigned assessment: companyId is required and must match creator's company membership
      if (!companyId) {
        throw new AppError("Active company context (X-Company-Id header) is required to access analytics.", {
          statusCode: 400,
          code: "COMPANY_CONTEXT_REQUIRED",
        });
      }
      if (assessment.createdById) {
        const creatorMember = await prisma.companyMember.findUnique({
          where: {
            companyId_userId: {
              companyId,
              userId: assessment.createdById,
            },
          },
        });
        if (!creatorMember) {
          throw new AppError("You do not have access to this legacy assessment analytics.", {
            statusCode: 403,
            code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ANALYTICS_ACCESS_DENIED,
          });
        }
      }
    }
  }
}

async function getAssessmentOverview({ assessmentId, user, companyId = null }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);
  await assertAssessmentObjectAccess(assessment, user, companyId);

  const overview = await repository.getOverview(assessmentId);

  return mapOverview({
    assessment,
    ...overview,
  });
}

async function getResultDistribution({ assessmentId, user, companyId = null }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);
  await assertAssessmentObjectAccess(assessment, user, companyId);

  const results = await repository.getResultDistribution(assessmentId);

  return mapDistribution(results);
}

async function getGameAnalytics({ assessmentId, user, companyId = null }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);
  await assertAssessmentObjectAccess(assessment, user, companyId);

  const rows = await repository.getGameAnalytics(assessmentId);

  return mapGameAnalytics(rows);
}

async function getQuestionAnalytics({ assessmentId, user, query, companyId = null }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);
  await assertAssessmentObjectAccess(assessment, user, companyId);

  const result = await repository.getQuestionAnalytics(assessmentId, query);

  return mapQuestionAnalytics(
    result.rows,
    result.total,
    query.page,
    query.limit
  );
}

module.exports = {
  getAssessmentOverview,
  getResultDistribution,
  getGameAnalytics,
  getQuestionAnalytics,
};
