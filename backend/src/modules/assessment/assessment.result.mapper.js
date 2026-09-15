"use strict";

function mapCandidateResult(data) {
  const res = data.assessmentResult || data.result;
  if (!res) {
    return null;
  }

  return {
    id: res.id,
    assessment: {
      id: data.assessment?.id || data.assessmentId,
      title: data.assessment?.title || null,
    },
    score: res.score,
    percentage: res.percentage,
    status: res.status,
    feedback: res.feedback || null,
    createdAt: res.createdAt,
  };
}

function mapAssessmentResultListItem(item) {
  const res = item.assessmentResult || item.result;
  const candidateName = [
    item.candidate?.firstName,
    item.candidate?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    candidate: {
      id: item.candidate?.id || item.candidateId,
      name: candidateName || null,
      email: item.candidate?.email || null,
    },
    result: res
      ? {
          id: res.id,
          score: res.score,
          percentage: res.percentage,
          status: res.status,
          createdAt: res.createdAt,
        }
      : null,
  };
}

function mapResultDetails(data) {
  const res = data.assessmentResult || data.result;
  return {
    candidate: {
      id: data.candidate?.id || data.candidateId,
      firstName: data.candidate?.firstName || null,
      lastName: data.candidate?.lastName || null,
      email: data.candidate?.email || null,
    },
    assessment: {
      id: data.assessment?.id || data.assessmentId,
      title: data.assessment?.title || null,
      maximumScore: data.assessment?.maximumScore ?? 100,
      passingScore: data.assessment?.passingScore ?? 60,
    },
    result: res
      ? {
          id: res.id,
          score: res.score,
          percentage: res.percentage,
          status: res.status,
          feedback: res.feedback || null,
          createdAt: res.createdAt,
        }
      : null,
    games: (data.gameResults || []).map((gameResult) => ({
      id: gameResult.id,
      game: {
        id: gameResult.game?.id || gameResult.gameId,
        name: gameResult.game?.name || null,
        code: gameResult.game?.code || null,
      },
      score: gameResult.score,
      createdAt: gameResult.createdAt,
    })),
  };
}

function mapAttempt(attempt) {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber || 1,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    percentage: attempt.percentage,
    passed: attempt.passed !== undefined ? attempt.passed : attempt.result === "PASS",
  };
}

module.exports = {
  mapCandidateResult,
  mapAssessmentResultListItem,
  mapResultDetails,
  mapAttempt,
};
