"use strict";

const {
  validateAssessmentIdParams,
  validateAnalyticsQuery,
} = require("./assessment.analytics.validator");

const service = require("./assessment.analytics.service");

const {
  createOverviewDto,
  createDistributionDto,
  createGameAnalyticsDto,
  createQuestionAnalyticsDto,
} = require("./assessment.analytics.dto");

async function getOverview(req, res, next) {
  try {
    const { assessmentId } = validateAssessmentIdParams(req.params);

    const data = await service.getAssessmentOverview({
      assessmentId,
      user: req.user,
    });

    return res.status(200).json(createOverviewDto(data));
  } catch (error) {
    return next(error);
  }
}

async function getDistribution(req, res, next) {
  try {
    const { assessmentId } = validateAssessmentIdParams(req.params);

    const data = await service.getResultDistribution({
      assessmentId,
      user: req.user,
    });

    return res.status(200).json(createDistributionDto(data));
  } catch (error) {
    return next(error);
  }
}

async function getGames(req, res, next) {
  try {
    const { assessmentId } = validateAssessmentIdParams(req.params);

    const data = await service.getGameAnalytics({
      assessmentId,
      user: req.user,
    });

    return res.status(200).json(createGameAnalyticsDto(data));
  } catch (error) {
    return next(error);
  }
}

async function getQuestions(req, res, next) {
  try {
    const { assessmentId } = validateAssessmentIdParams(req.params);

    const query = validateAnalyticsQuery(req.query);

    const data = await service.getQuestionAnalytics({
      assessmentId,
      user: req.user,
      query,
    });

    return res.status(200).json(createQuestionAnalyticsDto(data));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getOverview,
  getDistribution,
  getGames,
  getQuestions,
};
