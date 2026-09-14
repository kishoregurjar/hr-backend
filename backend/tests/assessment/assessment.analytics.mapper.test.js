"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  mapOverview,
  mapDistribution,
  mapGameAnalytics,
  mapQuestionAnalytics,
} = require("../../src/modules/assessment/assessment.analytics.mapper");

test("Assessment Analytics Mapper Suite", async (t) => {
  await t.test("maps average score, pass rate, fail rate, and completion rate", () => {
    const input = {
      assessment: {
        id: "asmt_1",
        title: "Backend Core",
        passingScore: 60,
        maximumScore: 100,
        durationMinutes: 60,
        maxAttempts: 2,
        status: "PUBLISHED",
      },
      resultStats: {
        _count: { _all: 10 },
        _avg: { score: 75.5, percentage: 75.5 },
      },
      resultStatusStats: [
        { status: "PASS", _count: { _all: 8 } },
        { status: "FAIL", _count: { _all: 2 } },
      ],
      assignmentStats: [
        { status: "SUBMITTED", _count: { _all: 10 } },
        { status: "NOT_STARTED", _count: { _all: 2 } },
      ],
      attemptStats: [
        { status: "SUBMITTED", _count: { _all: 10 } },
        { status: "EXPIRED", _count: { _all: 1 } },
      ],
    };

    const overview = mapOverview(input);

    assert.strictEqual(overview.assessment.id, "asmt_1");
    assert.strictEqual(overview.candidates.assigned, 12);
    assert.strictEqual(overview.candidates.completed, 10);
    assert.strictEqual(overview.candidates.completionRate, 83.33);
    assert.strictEqual(overview.results.total, 10);
    assert.strictEqual(overview.results.averageScore, 75.5);
    assert.strictEqual(overview.results.passed, 8);
    assert.strictEqual(overview.results.failed, 2);
    assert.strictEqual(overview.results.passRate, 80);
    assert.strictEqual(overview.results.failRate, 20);
  });

  await t.test("maps score distribution across buckets", () => {
    const results = [
      { percentage: 15 },
      { percentage: 35 },
      { percentage: 50 },
      { percentage: 75 },
      { percentage: 95 },
    ];

    const mapped = mapDistribution(results);
    assert.strictEqual(mapped.total, 5);
    assert.strictEqual(mapped.distribution.length, 5);
    const bucket0_20 = mapped.distribution.find((b) => b.key === "0_20");
    assert.strictEqual(bucket0_20.count, 1);
    assert.strictEqual(bucket0_20.percentage, 20);
  });

  await t.test("maps game analytics per game", () => {
    const rows = [
      {
        game: { id: "g1", name: "Zip Game", code: "ZIP" },
        score: 80,
      },
      {
        game: { id: "g1", name: "Zip Game", code: "ZIP" },
        score: 100,
      },
    ];

    const mapped = mapGameAnalytics(rows);
    assert.strictEqual(mapped.length, 1);
    assert.strictEqual(mapped[0].gameCode, "ZIP");
    assert.strictEqual(mapped[0].attempts, 2);
    assert.strictEqual(mapped[0].averageScore, 90);
    assert.strictEqual(mapped[0].highestScore, 100);
    assert.strictEqual(mapped[0].lowestScore, 80);
  });

  await t.test("maps question accuracy and pagination", () => {
    const rows = [
      {
        questionId: "q1",
        questionTitle: "JS Promises",
        questionSequence: 1,
        marks: 5,
        negativeMarks: 0,
        attempts: 10,
        correct: 8,
        incorrect: 2,
        unanswered: 0,
        accuracy: 80,
        averageMarks: 4,
      },
    ];

    const mapped = mapQuestionAnalytics(rows, 1, 1, 20);
    assert.strictEqual(mapped.rows.length, 1);
    assert.strictEqual(mapped.rows[0].accuracy, 80);
    assert.strictEqual(mapped.pagination.total, 1);
  });
});
