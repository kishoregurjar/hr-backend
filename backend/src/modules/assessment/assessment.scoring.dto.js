"use strict";

function buildAssessmentResultResponse(result) {
  return {
    id: result.id,
    score: result.score,
    percentage: result.percentage,
    status: result.status,
    createdAt: result.createdAt,
  };
}

module.exports = {
  buildAssessmentResultResponse,
};
