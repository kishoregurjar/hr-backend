"use strict";

const test = require("node:test");
const assert = require("node:assert");

const service = require("../../src/modules/assessment/assessment.result.service");
const repository = require("../../src/modules/assessment/assessment.result.repository");

test("Assessment Result Service Suite", async (t) => {
  await t.test("getCandidateResult retrieves candidate result if present", async () => {
    const candidateAssessmentId = "cand_asmt_service_1";
    const candidateId = "cand_user_1";

    repository.seedInMemoryResult(candidateAssessmentId, {
      id: candidateAssessmentId,
      candidateId,
      assessmentId: "asmt_1",
      status: "SUBMITTED",
      assessment: { id: "asmt_1", title: "Backend Test" },
      result: {
        id: "res_service_1",
        score: 80,
        percentage: 80,
        status: "PASS",
        createdAt: new Date(),
      },
    });

    const res = await service.getCandidateResult({
      candidateId,
      candidateAssessmentId,
    });

    assert.strictEqual(res.id, candidateAssessmentId);
    assert.strictEqual(res.result.status, "PASS");
  });

  await t.test("getCandidateResult throws 404 when result is not found", async () => {
    await assert.rejects(
      async () => {
        await service.getCandidateResult({
          candidateId: "nonexistent_user",
          candidateAssessmentId: "nonexistent_asmt",
        });
      },
      (err) => {
        return err.statusCode === 404 && err.code === "ASSESSMENT_RESULT_NOT_FOUND";
      }
    );
  });

  await t.test("getCandidateResult throws 409 when assessment result is not available yet", async () => {
    const candidateAssessmentId = "cand_asmt_unfinalized";
    const candidateId = "cand_user_2";

    repository.seedInMemoryResult(candidateAssessmentId, {
      id: candidateAssessmentId,
      candidateId,
      assessmentId: "asmt_1",
      status: "IN_PROGRESS",
      assessment: { id: "asmt_1", title: "Backend Test" },
      result: null,
    });

    await assert.rejects(
      async () => {
        await service.getCandidateResult({
          candidateId,
          candidateAssessmentId,
        });
      },
      (err) => {
        return err.statusCode === 409 && err.code === "ASSESSMENT_RESULT_NOT_READY";
      }
    );
  });

  await t.test("getAssessmentResults returns paginated list of results for HR", async () => {
    const assessmentId = "asmt_hr_1";
    repository.seedInMemoryResult("cand_asmt_hr_1", {
      id: "cand_asmt_hr_1",
      candidateId: "cand_1",
      assessmentId,
      candidate: { firstName: "John", lastName: "Doe", email: "john@example.com" },
      result: {
        id: "res_hr_1",
        score: 95,
        percentage: 95,
        status: "PASS",
        createdAt: new Date(),
      },
    });

    const res = await service.getAssessmentResults({
      assessmentId,
      query: { page: 1, limit: 10, sortBy: "percentage", sortOrder: "desc" },
    });

    assert.strictEqual(res.total >= 1, true);
    assert.strictEqual(res.items.length >= 1, true);
  });
});
