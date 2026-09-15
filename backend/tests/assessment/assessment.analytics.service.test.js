"use strict";

const test = require("node:test");
const assert = require("node:assert");

const service = require("../../src/modules/assessment/assessment.analytics.service");
const repository = require("../../src/modules/assessment/assessment.analytics.repository");

test("Assessment Analytics Service Suite", async (t) => {
  await t.test("rejects unauthenticated analytics access", async () => {
    await assert.rejects(
      async () => {
        await service.getAssessmentOverview({
          assessmentId: "asmt_1",
          user: null,
        });
      },
      (err) => {
        return err.statusCode === 401 && err.code === "ASSESSMENT_ANALYTICS_ACCESS_DENIED";
      }
    );
  });

  await t.test("rejects CANDIDATE analytics access", async () => {
    await assert.rejects(
      async () => {
        await service.getAssessmentOverview({
          assessmentId: "asmt_1",
          user: { id: "u_cand", role: "CANDIDATE" },
        });
      },
      (err) => {
        return err.statusCode === 403 && err.code === "ASSESSMENT_ANALYTICS_ACCESS_DENIED";
      }
    );
  });

  await t.test("returns 404 for missing assessment", async () => {
    await assert.rejects(
      async () => {
        await service.getAssessmentOverview({
          assessmentId: "nonexistent_asmt",
          user: { id: "u_hr", role: "HR" },
        });
      },
      (err) => {
        return err.statusCode === 404 && err.code === "ASSESSMENT_NOT_FOUND";
      }
    );
  });

  await t.test("allows HR and SUPER_ADMIN analytics access", async () => {
    const assessmentId = "asmt_serv_test_1";
    repository.seedInMemoryAnalytics(assessmentId, {
      assessment: {
        id: assessmentId,
        title: "Node.js Analytics Test",
        passingScore: 60,
        maximumScore: 100,
        durationMinutes: 60,
        status: "PUBLISHED",
      },
      resultStats: { _count: { _all: 5 }, _avg: { score: 80, percentage: 80 } },
      resultStatusStats: [{ status: "PASS", _count: { _all: 5 } }],
      assignmentStats: [{ status: "SUBMITTED", _count: { _all: 5 } }],
      attemptStats: [{ status: "SUBMITTED", _count: { _all: 5 } }],
    });

    const overviewHR = await service.getAssessmentOverview({
      assessmentId,
      user: { id: "u_hr", role: "HR" },
    });
    assert.strictEqual(overviewHR.assessment.id, assessmentId);

    const overviewAdmin = await service.getAssessmentOverview({
      assessmentId,
      user: { id: "u_admin", role: "SUPER_ADMIN" },
    });
    assert.strictEqual(overviewAdmin.results.total, 5);
  });
});
