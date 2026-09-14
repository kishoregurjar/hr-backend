"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateQuestionScore,
  calculateWeightedGameScore,
} = require("../../src/modules/assessment/assessment.scoring.service");

test("Assessment Scoring - Question Marks Calculation", () => {
  const answers = [
    { marksAwarded: 10, isCorrect: true },
    { marksAwarded: 15, isCorrect: true },
    { marksAwarded: 0, isCorrect: false },
  ];
  const score = calculateQuestionScore(answers);
  assert.equal(score, 25);
});

test("Assessment Scoring - Weighted Game Score Calculation", () => {
  const gameResults = [
    { gameId: "game_zip", score: 80 },
    { gameId: "game_tango", score: 100 },
  ];
  const assessmentGames = [
    { gameId: "game_zip", weight: 1.0 },
    { gameId: "game_tango", weight: 2.0 },
  ];

  // (80 * 1.0 + 100 * 2.0) / (1.0 + 2.0) = (80 + 200) / 3 = 93.333
  const weightedScore = calculateWeightedGameScore(gameResults, assessmentGames);
  assert.equal(Math.round(weightedScore), 93);
});
