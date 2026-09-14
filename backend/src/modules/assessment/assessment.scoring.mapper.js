"use strict";

function mapAssessmentResult(result) {
  return {
    id: result.id,
    score: result.score,
    percentage: result.percentage,
    status: result.status,
    createdAt: result.createdAt || new Date(),
  };
}

module.exports = {
  mapAssessmentResult,
};
