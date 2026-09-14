"use strict";

const test = require("node:test");
const assert = require("node:assert");

const service = require("../../src/modules/assessment/assessment.result.service");
const repository = require("../../src/modules/assessment/assessment.result.repository");
const mapper = require("../../src/modules/assessment/assessment.result.mapper");
const dto = require("../../src/modules/assessment/assessment.result.dto");

test("Assessment Result Integration Suite", async (t) => {
  await t.test("Candidate cannot access another candidate's result (IDOR isolation)", async () => {
    const candidateA_Id = "user_candidate_A";
    const candidateB_Id = "user_candidate_B";
    const candidateAssessmentId_B = "cand_asmt_belonging_to_B";

    repository.seedInMemoryResult(candidateAssessmentId_B, {
      id: candidateAssessmentId_B,
      candidateId: candidateB_Id,
      userId: candidateB_Id,
      assessmentId: "asmt_secure_1",
      assessment: { id: "asmt_secure_1", title: "Isolated Test" },
      result: {
        id: "res_B",
        score: 90,
        percentage: 90,
        status: "PASS",
        createdAt: new Date(),
      },
    });

    await assert.rejects(
      async () => {
        await service.getCandidateResult({
          candidateId: candidateA_Id,
          candidateAssessmentId: candidateAssessmentId_B,
        });
      },
      (err) => {
        return err.statusCode === 404 && err.code === "ASSESSMENT_RESULT_NOT_FOUND";
      }
    );
  });

  await t.test("Returns 409 when assessment is not finalized", async () => {
    const candidateId = "user_candidate_C";
    const candidateAssessmentId = "cand_asmt_in_progress";

    repository.seedInMemoryResult(candidateAssessmentId, {
      id: candidateAssessmentId,
      candidateId,
      userId: candidateId,
      assessmentId: "asmt_secure_2",
      assessment: { id: "asmt_secure_2", title: "Unfinalized Assessment" },
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

  await t.test("HR can list assessment results with search, filter, and pagination", async () => {
    const assessmentId = "asmt_hr_list_1";

    repository.seedInMemoryResult("cand_asmt_pass_1", {
      id: "cand_asmt_pass_1",
      assessmentId,
      candidate: { firstName: "Dev", lastName: "One", email: "dev1@test.com" },
      result: {
        id: "res_p1",
        score: 92,
        percentage: 92,
        status: "PASS",
        createdAt: new Date("2026-09-14T01:00:00Z"),
      },
    });

    repository.seedInMemoryResult("cand_asmt_fail_1", {
      id: "cand_asmt_fail_1",
      assessmentId,
      candidate: { firstName: "Dev", lastName: "Two", email: "dev2@test.com" },
      result: {
        id: "res_f1",
        score: 45,
        percentage: 45,
        status: "FAIL",
        createdAt: new Date("2026-09-14T02:00:00Z"),
      },
    });

    // List all
    const allResults = await service.getAssessmentResults({
      assessmentId,
      query: { page: 1, limit: 10, sortBy: "percentage", sortOrder: "desc" },
    });

    assert.strictEqual(allResults.total >= 2, true);

    const formatted = dto.buildAssessmentResultsResponse({
      items: allResults.items.map(mapper.mapAssessmentResultListItem),
      total: allResults.total,
      page: allResults.page,
      limit: allResults.limit,
    });

    assert.strictEqual(formatted.success, true);
    assert.strictEqual(formatted.pagination.page, 1);

    // Filter status PASS
    const passResults = await service.getAssessmentResults({
      assessmentId,
      query: { page: 1, limit: 10, status: "PASS", sortBy: "createdAt", sortOrder: "desc" },
    });

    const passMapped = passResults.items.map(mapper.mapAssessmentResultListItem);
    assert.strictEqual(passMapped.every((i) => i.result.status === "PASS"), true);
  });

  await t.test("Result response never exposes candidate answer keys or sensitive evaluation internal details", async () => {
    const candidateAssessmentId = "cand_asmt_sec_check";

    repository.seedInMemoryResult(candidateAssessmentId, {
      id: candidateAssessmentId,
      candidate: { id: "cand_10", firstName: "Sec", lastName: "Tester", email: "sec@test.com" },
      assessment: { id: "asmt_10", title: "Sec Assessment", maximumScore: 100, passingScore: 60 },
      result: {
        id: "res_sec_10",
        score: 88,
        percentage: 88,
        status: "PASS",
        createdAt: new Date(),
      },
      gameResults: [
        {
          id: "gres_sec",
          game: { id: "g_1", name: "Zip Game", code: "ZIP_CODE" },
          score: 90,
          createdAt: new Date(),
        },
      ],
    });

    const rawDetails = await service.getResultDetails(candidateAssessmentId);
    const mappedDetails = mapper.mapResultDetails(rawDetails);

    const jsonString = JSON.stringify(mappedDetails);
    assert.strictEqual(jsonString.includes("isCorrect"), false);
    assert.strictEqual(jsonString.includes("solutionKey"), false);
    assert.strictEqual(jsonString.includes("puzzleState"), false);
    assert.strictEqual(jsonString.includes("telemetryRaw"), false);
    assert.strictEqual(mappedDetails.result.score, 88);
    assert.strictEqual(mappedDetails.games.length, 1);
  });
});
