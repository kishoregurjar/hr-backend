"use strict";

const service = require("./assessment.result.service");
const mapper = require("./assessment.result.mapper");
const dto = require("./assessment.result.dto");
const {
  validateResultQuery,
  validateAssessmentIdParams,
  validateCandidateAssessmentParams,
} = require("./assessment.result.validator");

async function getCandidateResult(req, res, next) {
  try {
    const { candidateAssessmentId } = validateCandidateAssessmentParams(req.params);

    const result = await service.getCandidateResult({
      candidateId: req.user?.id,
      candidateAssessmentId,
    });

    return res
      .status(200)
      .json(dto.buildCandidateResultResponse(mapper.mapCandidateResult(result)));
  } catch (err) {
    return next(err);
  }
}

async function getAssessmentResults(req, res, next) {
  try {
    const { assessmentId } = validateAssessmentIdParams(req.params);
    const query = validateResultQuery(req.query);

    const result = await service.getAssessmentResults({
      assessmentId,
      query,
    });

    const mapped = result.items.map(mapper.mapAssessmentResultListItem);

    return res.status(200).json(
      dto.buildAssessmentResultsResponse({
        items: mapped,
        total: result.total,
        page: result.page,
        limit: result.limit,
      })
    );
  } catch (err) {
    return next(err);
  }
}

async function getResultDetails(req, res, next) {
  try {
    const { candidateAssessmentId } = validateCandidateAssessmentParams(req.params);

    const result = await service.getResultDetails(candidateAssessmentId);

    return res
      .status(200)
      .json(dto.buildResultDetailsResponse(mapper.mapResultDetails(result)));
  } catch (err) {
    return next(err);
  }
}

async function getCandidateAttempts(req, res, next) {
  try {
    const { candidateAssessmentId } = validateCandidateAssessmentParams(req.params);

    const attempts = await service.getCandidateAttempts({
      candidateId: req.user?.id,
      candidateAssessmentId,
    });

    return res
      .status(200)
      .json(dto.buildAttemptsResponse(attempts.map(mapper.mapAttempt)));
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCandidateResult,
  getAssessmentResults,
  getResultDetails,
  getCandidateAttempts,
};
