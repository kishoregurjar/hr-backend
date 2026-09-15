"use strict";

const { AppError } = require("../../utils/app-error");
const repository = require("./assessment.result.repository");
const { ASSESSMENT_RESULT_CONSTANTS } = require("./assessment.result.constants");

async function getCandidateResult({ candidateId, candidateAssessmentId }) {
  const data = await repository.findCandidateResult({
    candidateAssessmentId,
    candidateId,
  });

  if (!data) {
    throw new AppError("Assessment result not found.", {
      statusCode: 404,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_FOUND,
    });
  }

  const result = data.assessmentResult || data.result;
  if (!result) {
    throw new AppError("Assessment result is not available yet.", {
      statusCode: 409,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_READY,
    });
  }

  return data;
}

async function getAssessmentResults({ assessmentId, query }) {
  return repository.findAssessmentResults({
    assessmentId,
    status: query.status,
    search: query.search,
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

async function getResultDetails(candidateAssessmentId) {
  const result = await repository.findResultDetails(candidateAssessmentId);

  if (!result) {
    throw new AppError("Assessment result not found.", {
      statusCode: 404,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_FOUND,
    });
  }

  const res = result.assessmentResult || result.result;
  if (!res) {
    throw new AppError("Assessment has not been finalized.", {
      statusCode: 409,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_READY,
    });
  }

  return result;
}

async function getCandidateAttempts({ candidateId, candidateAssessmentId }) {
  return repository.findCandidateAttempts({
    candidateId,
    candidateAssessmentId,
  });
}

module.exports = {
  getCandidateResult,
  getAssessmentResults,
  getResultDetails,
  getCandidateAttempts,
};
