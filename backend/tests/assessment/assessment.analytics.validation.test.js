"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  validateAssessmentIdParams,
  validateAnalyticsQuery,
} = require("../../src/modules/assessment/assessment.analytics.validator");

test("Assessment Analytics Validation Suite", async (t) => {
  await t.test("accepts valid analytics query and applies pagination defaults", () => {
    const parsed = validateAnalyticsQuery({});
    assert.strictEqual(parsed.page, 1);
    assert.strictEqual(parsed.limit, 20);
    assert.strictEqual(parsed.sortBy, "accuracy");
    assert.strictEqual(parsed.sortOrder, "desc");
  });

  await t.test("rejects limit > 100", () => {
    assert.throws(() => {
      validateAnalyticsQuery({ limit: 150 });
    });
  });

  await t.test("rejects invalid sort field", () => {
    assert.throws(() => {
      validateAnalyticsQuery({ sortBy: "invalid_field" });
    });
  });

  await t.test("rejects unexpected query fields due to strict schema", () => {
    assert.throws(() => {
      validateAnalyticsQuery({ unexpectedField: "hack" });
    });
  });

  await t.test("validates assessmentId params correctly", () => {
    const parsed = validateAssessmentIdParams({ assessmentId: "asmt_analytics_1" });
    assert.strictEqual(parsed.assessmentId, "asmt_analytics_1");
  });
});
