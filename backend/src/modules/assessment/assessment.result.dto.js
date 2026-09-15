"use strict";

function buildCandidateResultResponse(result) {
  return {
    success: true,
    data: result,
  };
}

function buildAssessmentResultsResponse({ items, total, page, limit }) {
  const totalPages = Math.ceil(total / limit) || 0;

  return {
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

function buildResultDetailsResponse(result) {
  return {
    success: true,
    data: result,
  };
}

function buildAttemptsResponse(attempts) {
  return {
    success: true,
    data: attempts,
  };
}

module.exports = {
  buildCandidateResultResponse,
  buildAssessmentResultsResponse,
  buildResultDetailsResponse,
  buildAttemptsResponse,
};
