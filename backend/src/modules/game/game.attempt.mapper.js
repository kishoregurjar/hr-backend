"use strict";

function mapGameAttemptForCandidate(attempt, game, puzzle, metadata = null) {
  return {
    attemptId: attempt.id,
    game: {
      id: game?.id || metadata?.id || game?.code,
      code: game?.code || metadata?.code,
      name: game?.name || metadata?.name,
      slug: metadata?.slug || null,
      category: metadata?.category || "COGNITIVE",
    },
    puzzle,
    puzzleVersion: attempt?.puzzleVersion || 1,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
  };
}

function toCandidatePuzzleResponse(attempt) {
  const state = attempt.puzzleState || {};
  return {
    attemptId: attempt.id,
    game: {
      id: attempt.gameId,
    },
    puzzle: state.puzzle || state,
    puzzleVersion: attempt.puzzleVersion || 1,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
  };
}

function mapGameResult(result) {
  return {
    id: result.id,
    candidateAssessmentId: result.candidateAssessmentId,
    gameId: result.gameId,
    score: result.score,
    status: "SUBMITTED",
    submittedAt: result.submittedAt || result.updatedAt,
    metrics: result.metrics || {},
  };
}

module.exports = {
  mapGameAttemptForCandidate,
  toCandidatePuzzleResponse,
  mapGameResult,
};
