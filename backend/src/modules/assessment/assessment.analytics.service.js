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

async function getAssessmentOverview({ assessmentId, user }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ASSESSMENT_NOT_FOUND,
    });
  }

  const overview = await repository.getOverview(assessmentId);

  return mapOverview({
    assessment,
    ...overview,
  });
}

async function getResultDistribution({ assessmentId, user }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ASSESSMENT_NOT_FOUND,
    });
  }

  const results = await repository.getResultDistribution(assessmentId);

  return mapDistribution(results);
}

async function getGameAnalytics({ assessmentId, user }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ASSESSMENT_NOT_FOUND,
    });
  }

  const rows = await repository.getGameAnalytics(assessmentId);

  return mapGameAnalytics(rows);
}

async function getQuestionAnalytics({ assessmentId, user, query }) {
  assertAssessmentAccess(user);

  const assessment = await repository.findAssessmentById(assessmentId);

  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_ANALYTICS_CONSTANTS.ERROR_CODES.ASSESSMENT_NOT_FOUND,
    });
  }

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
