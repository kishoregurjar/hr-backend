"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  ASSESSMENT_ANALYTICS_CONSTANTS,
} = require("../../src/modules/assessment/assessment.analytics.constants");

test("Assessment Analytics Constants Suite", async (t) => {
  await t.test("PAGINATION constants are correctly defined", () => {
    assert.strictEqual(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.DEFAULT_PAGE, 1);
    assert.strictEqual(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.DEFAULT_LIMIT, 20);
    assert.strictEqual(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.MAX_LIMIT, 100);
  });

  await t.test("SCORE_DISTRIBUTION ranges cover 0 to 100", () => {
    const buckets = ASSESSMENT_ANALYTICS_CONSTANTS.SCORE_DISTRIBUTION;
    assert.strictEqual(buckets.length, 5);
    assert.strictEqual(buckets[0].min, 0);
    assert.strictEqual(buckets[4].max, 100);
  });

  await t.test("SORT allowed fields include expected fields", () => {
    const fields = ASSESSMENT_ANALYTICS_CONSTANTS.SORT.ALLOWED_FIELDS;
    assert.strictEqual(fields.includes("accuracy"), true);
    assert.strictEqual(fields.includes("averageMarks"), true);
  });
});
