"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const {
  attemptResultQuerySchema,
  assessmentAnalyticsQuerySchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Step 15 — HR Real-Time Result Analytics Dashboard Suite", () => {
  it("should validate default attempt result query params", () => {
    const result = attemptResultQuerySchema.safeParse({});
    assert.equal(result.success, true);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, 20);
    assert.equal(result.data.sortBy, "createdAt");
    assert.equal(result.data.sortOrder, "desc");
  });

  it("should reject limit above 100 in attempt result query", () => {
    const result = attemptResultQuerySchema.safeParse({ limit: 500 });
    assert.equal(result.success, false);
  });

  it("should validate valid date range in analytics query", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");
    const result = assessmentAnalyticsQuerySchema.safeParse({ from, to });
    assert.equal(result.success, true);
  });

  it("should reject invalid date range where from > to", () => {
    const from = new Date("2026-02-01");
    const to = new Date("2026-01-01");
    const result = assessmentAnalyticsQuerySchema.safeParse({ from, to });
    assert.equal(result.success, false);
  });

  it("should reject candidate role from accessing HR results", async () => {
    try {
      await attemptService.getHRAttemptResults({
        user: { role: "CANDIDATE" },
      });
      assert.fail("Should have thrown ForbiddenError");
    } catch (err) {
      assert.equal(err.name, "ForbiddenError");
    }
  });

  it("should reject candidate role from accessing assessment analytics", async () => {
    try {
      await attemptService.getAssessmentDashboard({
        assessmentId: "asm_123",
        user: { role: "CANDIDATE" },
      });
      assert.fail("Should have thrown ForbiddenError");
    } catch (err) {
      assert.equal(err.name, "ForbiddenError");
    }
  });

  it("should expose HR analytics service methods", () => {
    assert.equal(typeof attemptService.getHRAttemptResults, "function");
    assert.equal(typeof attemptService.getAssessmentDashboard, "function");
    assert.equal(typeof attemptService.getHRAttemptDetail, "function");
  });
});
