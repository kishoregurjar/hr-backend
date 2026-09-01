const test = require("node:test");
const assert = require("node:assert");
const {
  createAssessmentBodySchema,
} = require("../../src/modules/assessment/assessment.validator");

test("Assessment Validation Schema Suite", async (t) => {
  await t.test("Valid assessment payload passes validation", () => {
    const validData = {
      title: "Senior Node.js Assessment",
      description: "Comprehensive backend developer evaluation",
      instructions: "Answer all questions in time",
      durationMinutes: 60,
      passingScore: 50,
      maximumScore: 100,
      maxAttempts: 2,
      type: "TECHNICAL",
      difficulty: "MEDIUM",
    };

    const parsed = createAssessmentBodySchema.parse(validData);
    assert.strictEqual(parsed.title, "Senior Node.js Assessment");
    assert.strictEqual(parsed.durationMinutes, 60);
    assert.strictEqual(parsed.maximumScore, 100);
  });

  await t.test("Rejects passingScore greater than maximumScore", () => {
    const invalidData = {
      title: "Invalid Score Assessment",
      durationMinutes: 30,
      passingScore: 120,
      maximumScore: 100,
    };

    assert.throws(() => {
      createAssessmentBodySchema.parse(invalidData);
    });
  });

  await t.test("Rejects negative durationMinutes", () => {
    const invalidData = {
      title: "Negative Duration Assessment",
      durationMinutes: -15,
      passingScore: 10,
      maximumScore: 50,
    };

    assert.throws(() => {
      createAssessmentBodySchema.parse(invalidData);
    });
  });
});
