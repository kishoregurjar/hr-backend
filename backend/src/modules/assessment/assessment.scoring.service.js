"use strict";

const { NotFoundError, ConflictError, BadRequestError } = require("../../common/errors");
const repository = require("./assessment.scoring.repository");
const { ASSESSMENT_SCORING_CONSTANTS } = require("./assessment.scoring.constants");

function calculateQuestionScore(answers = []) {
  return answers.reduce((total, answer) => {
    return total + Number(answer.marksAwarded || (answer.isCorrect ? 1 : 0));
  }, 0);
}

function calculateWeightedGameScore(gameResults = [], assessmentGames = []) {
  if (!gameResults.length) {
    return 0;
  }

  const weightMap = new Map();
  if (Array.isArray(assessmentGames)) {
    for (const ag of assessmentGames) {
      weightMap.set(ag.gameId, ag.weight || 1.0);
    }
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const result of gameResults) {
    const weight = weightMap.get(result.gameId) || 1.0;
    const gameScore = Number(result.score || 0);
    totalWeightedScore += gameScore * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return 0;
  return totalWeightedScore / totalWeight;
}

async function finalizeAssessment(candidateAssessmentId) {
  const candidateAssessment = await repository.findCandidateAssessmentForScoring(
    candidateAssessmentId
  );

  if (!candidateAssessment) {
    throw new NotFoundError(
      "Candidate assessment not found.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.CANDIDATE_ASSESSMENT_NOT_FOUND
    );
  }

  if (candidateAssessment.assessmentResult) {
    throw new ConflictError(
      "Assessment has already been finalized.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.ASSESSMENT_ALREADY_FINALIZED
    );
  }

  const questionScore = calculateQuestionScore(candidateAssessment.answers || []);
  const gameScore = calculateWeightedGameScore(
    candidateAssessment.gameResults || [],
    candidateAssessment.assessment?.games || []
  );

  const rawScore = questionScore + gameScore;
  const maximumScore = Number(candidateAssessment.assessment?.maximumScore || 100);

  if (maximumScore <= 0 || rawScore < 0) {
    throw new BadRequestError(
      "Invalid assessment score calculation.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.INVALID_ASSESSMENT_SCORE
    );
  }

  const score = Math.min(rawScore, maximumScore);
  const percentage = Math.min(
    100,
    Math.max(0, Number(((score / maximumScore) * 100).toFixed(2)))
  );

  const passingScore = Number(candidateAssessment.assessment?.passingScore || 60);
  const passed = score >= passingScore;
  const status = passed ? "PASS" : "FAIL";

  const result = await repository.createAssessmentResult({
    candidateAssessmentId,
    score,
    percentage,
    status,
  });

  await repository.updateCandidateAssessmentResult({
    candidateAssessmentId,
    status: "SUBMITTED",
  });

  return {
    id: result.id,
    candidateAssessmentId,
    score,
    percentage,
    status,
    passed,
  };
}

module.exports = {
  calculateQuestionScore,
  calculateWeightedGameScore,
  finalizeAssessment,
};
