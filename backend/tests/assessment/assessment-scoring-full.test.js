"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateQuestionComponent,
  calculateGameComponent,
  calculateOverallPercentage,
  calculateFinalScore,
  finalizeAssessment,
} = require("../../src/modules/assessment/assessment.scoring.service");

test("Assessment Scoring - Question Component Calculation", () => {
  const assessmentQuestions = [
    { questionId: "q1", marks: 10 },
    { questionId: "q2", marks: 20 },
  ];
  const answers = [
    { questionId: "q1", marksAwarded: 10, isCorrect: true },
    { questionId: "q2", marksAwarded: 10, isCorrect: false },
  ];

  const result = calculateQuestionComponent({ assessmentQuestions, answers });
  assert.equal(result.earnedMarks, 20);
  assert.equal(result.maximumMarks, 30);
  assert.equal(result.percentage, 66.67);
});

test("Assessment Scoring - Weighted Game Component Calculation", () => {
  const assessmentGames = [
    { gameId: "game_zip", weight: 1 },
    { gameId: "game_tango", weight: 3 },
  ];
  const gameResults = [
    { gameId: "game_zip", score: 60 },
    { gameId: "game_tango", score: 100 },
  ];

  // (60 * 1 + 100 * 3) / (1 + 3) = 360 / 4 = 90
  const result = calculateGameComponent({ assessmentGames, gameResults });
  assert.equal(result.percentage, 90);
  assert.equal(result.totalWeight, 4);
});

test("Assessment Scoring - Overall Percentage Blending (50% Questions + 50% Games)", () => {
  const questionComponent = { maximumMarks: 100, percentage: 80 };
  const gameComponent = { totalWeight: 2, percentage: 90 };

  const overallPercentage = calculateOverallPercentage({
    questionComponent,
    gameComponent,
  });
  // 80 * 0.5 + 90 * 0.5 = 40 + 45 = 85
  assert.equal(overallPercentage, 85);
});

test("Assessment Scoring - Conversion to Maximum Score", () => {
  const finalScore = calculateFinalScore({
    percentage: 85,
    maximumScore: 200,
  });
  // 85% of 200 = 170
  assert.equal(finalScore, 170);
});

test("Assessment Scoring - Finalize Assessment Flow (PASS / FAIL)", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_scoring_test_1";

  const result = await finalizeAssessment({
    candidateId,
    candidateAssessmentId,
  });

  assert.ok(result.id);
  assert.equal(typeof result.score, "number");
  assert.equal(typeof result.percentage, "number");
  assert.ok(result.status === "PASS" || result.status === "FAIL");

  // Second finalization should return alreadyFinalized: true
  const secondResult = await finalizeAssessment({
    candidateId,
    candidateAssessmentId,
  });

  assert.equal(secondResult.alreadyFinalized, true);
  assert.equal(secondResult.id, result.id);
});
