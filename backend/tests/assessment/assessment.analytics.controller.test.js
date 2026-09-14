"use strict";

const test = require("node:test");
const assert = require("node:assert");

const service = require("../../src/modules/assessment/assessment.analytics.service");
const repository = require("../../src/modules/assessment/assessment.analytics.repository");
const mapper = require("../../src/modules/assessment/assessment.analytics.mapper");

test("Assessment Analytics Controller & Data Security Suite", async (t) => {
  await t.test("does not expose question correct answers or internal evaluation details in question analytics", async () => {
    const assessmentId = "asmt_sec_ctrl_1";
    repository.seedInMemoryAnalytics(assessmentId, {
      assessment: {
        id: assessmentId,
        title: "Secure Analytics",
        passingScore: 60,
        maximumScore: 100,
      },
      questionRows: [
        {
          questionId: "q_sec_1",
          questionTitle: "What is Event Loop?",
          questionSequence: 1,
          marks: 5,
          negativeMarks: 1,
          attempts: 10,
          correct: 7,
          incorrect: 3,
          unanswered: 0,
          accuracy: 70,
          averageMarks: 3.5,
        },
      ],
    });

    const data = await service.getQuestionAnalytics({
      assessmentId,
      user: { id: "u_hr", role: "HR" },
      query: { page: 1, limit: 20, sortBy: "accuracy", sortOrder: "desc" },
    });

    const jsonStr = JSON.stringify(data);
    assert.strictEqual(jsonStr.includes("correctAnswer"), false);
    assert.strictEqual(jsonStr.includes("selectedOptionIds"), false);
    assert.strictEqual(jsonStr.includes("isCorrect"), false);
    assert.strictEqual(data.rows[0].accuracy, 70);
  });
});
