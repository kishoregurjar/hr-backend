"use strict";

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError,
} = require("../../common/errors");
const repository = require("./assessment.scoring.repository");
const { ASSESSMENT_SCORING_CONSTANTS } = require("./assessment.scoring.constants");

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateQuestionComponent({ assessmentQuestions = [], answers = [] }) {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer]));

  let earnedMarks = 0;
  let maximumMarks = 0;

  for (const assessmentQuestion of assessmentQuestions) {
    const marks = Number(assessmentQuestion.marks);
    if (!Number.isFinite(marks) || marks < 0) {
      continue;
    }

    maximumMarks += marks;

    const answer = answerMap.get(assessmentQuestion.questionId);
    if (!answer) {
      continue;
    }

    const awarded = Number(answer.marksAwarded || (answer.isCorrect ? marks : 0));
    if (!Number.isFinite(awarded)) {
      continue;
    }

    earnedMarks += awarded;
  }

  if (maximumMarks <= 0) {
    return {
      earnedMarks: 0,
      maximumMarks: 0,
      percentage: 0,
    };
  }

  const percentage = clamp((earnedMarks / maximumMarks) * 100, 0, 100);

  return {
    earnedMarks,
    maximumMarks,
    percentage: round(percentage),
  };
}

function calculateGameComponent({ assessmentGames = [], gameResults = [] }) {
  const resultMap = new Map(gameResults.map((result) => [result.gameId, result]));

  let weightedScore = 0;
  let totalWeight = 0;
  const games = [];

  for (const assessmentGame of assessmentGames) {
    const weight = Number(assessmentGame.weight ?? 1);

    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BadRequestError(
        "Invalid assessment game weight.",
        ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.INVALID_SCORING_CONFIGURATION
      );
    }

    const result = resultMap.get(assessmentGame.gameId);
    const score = result ? clamp(Number(result.score), 0, 100) : 0;

    weightedScore += score * weight;
    totalWeight += weight;

    games.push({
      gameId: assessmentGame.gameId,
      weight,
      score,
    });
  }

  if (totalWeight === 0) {
    return {
      percentage: 0,
      totalWeight: 0,
      games,
    };
  }

  return {
    percentage: round(weightedScore / totalWeight),
    totalWeight,
    games,
  };
}

function calculateOverallPercentage({ questionComponent, gameComponent }) {
  const hasQuestions = questionComponent.maximumMarks > 0;
  const hasGames = gameComponent.totalWeight > 0;

  if (!hasQuestions && !hasGames) {
    throw new UnprocessableEntityError(
      "Assessment has no scorable components.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.INVALID_SCORING_CONFIGURATION
    );
  }

  if (hasQuestions && hasGames) {
    return round(
      questionComponent.percentage * 0.5 + gameComponent.percentage * 0.5
    );
  }

  if (hasQuestions) {
    return round(questionComponent.percentage);
  }

  return round(gameComponent.percentage);
}

function calculateFinalScore({ percentage, maximumScore }) {
  if (!Number.isFinite(maximumScore) || maximumScore <= 0) {
    throw new BadRequestError(
      "Invalid assessment maximum score.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.INVALID_SCORING_CONFIGURATION
    );
  }

  const normalizedPercentage = clamp(percentage, 0, 100);
  const score = (normalizedPercentage / 100) * maximumScore;
  return Math.round(score);
}

async function finalizeAssessment({ candidateId, candidateAssessmentId }) {
  const candidateAssessment =
    await repository.findCandidateAssessmentForScoring({
      candidateAssessmentId,
      candidateId,
    });

  if (!candidateAssessment) {
    throw new NotFoundError(
      "Candidate assessment not found.",
      ASSESSMENT_SCORING_CONSTANTS.ERROR_CODES.CANDIDATE_ASSESSMENT_NOT_FOUND
    );
  }

  if (candidateAssessment.assessmentResult) {
    return {
      alreadyFinalized: true,
      id: candidateAssessment.assessmentResult.id,
      score: candidateAssessment.assessmentResult.score,
      percentage: candidateAssessment.assessmentResult.percentage,
      status: candidateAssessment.assessmentResult.status,
    };
  }

  const questionComponent = calculateQuestionComponent({
    assessmentQuestions: candidateAssessment.assessment?.questions || [],
    answers: candidateAssessment.answers || [],
  });

  const gameComponent = calculateGameComponent({
    assessmentGames: candidateAssessment.assessment?.games || [],
    gameResults: candidateAssessment.gameResults || [],
  });

  const percentage = calculateOverallPercentage({
    questionComponent,
    gameComponent,
  });

  const score = calculateFinalScore({
    percentage,
    maximumScore: Number(
      candidateAssessment.assessment?.maximumScore || 100
    ),
  });

  const passingScore = Number(
    candidateAssessment.assessment?.passingScore || 60
  );
  const status = score >= passingScore ? "PASS" : "FAIL";

  const finalized = await repository.finalizeCandidateAssessment({
    candidateAssessmentId,
    score,
    percentage,
    status,
  });

  return {
    alreadyFinalized: finalized.alreadyFinalized,
    id: finalized.result.id,
    score: finalized.result.score,
    percentage: finalized.result.percentage,
    status: finalized.result.status,
  };
}

module.exports = {
  round,
  clamp,
  calculateQuestionComponent,
  calculateGameComponent,
  calculateOverallPercentage,
  calculateFinalScore,
  finalizeAssessment,
};
