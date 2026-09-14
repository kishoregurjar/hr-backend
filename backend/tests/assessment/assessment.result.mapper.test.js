"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  mapCandidateResult,
  mapAssessmentResultListItem,
  mapResultDetails,
  mapAttempt,
} = require("../../src/modules/assessment/assessment.result.mapper");

test("Assessment Result Mapper Suite", async (t) => {
  await t.test("mapCandidateResult maps result correctly", () => {
    const data = {
      assessment: { id: "asmt_1", title: "Node.js Evaluation" },
      assessmentResult: {
        id: "res_1",
        score: 85,
        percentage: 85,
        status: "PASS",
        createdAt: "2026-09-14T06:00:00.000Z",
      },
    };

    const mapped = mapCandidateResult(data);
    assert.strictEqual(mapped.id, "res_1");
    assert.strictEqual(mapped.assessment.title, "Node.js Evaluation");
    assert.strictEqual(mapped.score, 85);
    assert.strictEqual(mapped.status, "PASS");
  });

  await t.test("mapAssessmentResultListItem maps candidate info and result", () => {
    const item = {
      candidate: {
        id: "cand_1",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
      },
      assessmentResult: {
        id: "res_1",
        score: 90,
        percentage: 90,
        status: "PASS",
        createdAt: "2026-09-14T06:00:00.000Z",
      },
    };

    const mapped = mapAssessmentResultListItem(item);
    assert.strictEqual(mapped.candidate.id, "cand_1");
    assert.strictEqual(mapped.candidate.name, "Alice Smith");
    assert.strictEqual(mapped.candidate.email, "alice@example.com");
    assert.strictEqual(mapped.result.percentage, 90);
  });

  await t.test("mapResultDetails includes candidate, assessment, result, and game scores", () => {
    const data = {
      candidate: {
        id: "cand_1",
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@example.com",
      },
      assessment: {
        id: "asmt_1",
        title: "Full Stack Test",
        maximumScore: 100,
        passingScore: 60,
      },
      assessmentResult: {
        id: "res_2",
        score: 75,
        percentage: 75,
        status: "PASS",
        createdAt: "2026-09-14T06:00:00.000Z",
      },
      gameResults: [
        {
          id: "gres_1",
          game: { id: "g_1", name: "Zip Code Game", code: "ZIP_CODE" },
          score: 80,
          createdAt: "2026-09-14T06:00:00.000Z",
        },
      ],
    };

    const mapped = mapResultDetails(data);
    assert.strictEqual(mapped.candidate.firstName, "Bob");
    assert.strictEqual(mapped.assessment.title, "Full Stack Test");
    assert.strictEqual(mapped.result.score, 75);
    assert.strictEqual(mapped.games.length, 1);
    assert.strictEqual(mapped.games[0].game.code, "ZIP_CODE");
  });

  await t.test("mapAttempt maps attempt history", () => {
    const attempt = {
      id: "att_1",
      attemptNumber: 1,
      status: "SUBMITTED",
      startedAt: new Date(),
      expiresAt: new Date(),
      submittedAt: new Date(),
      score: 88,
      percentage: 88,
      passed: true,
    };

    const mapped = mapAttempt(attempt);
    assert.strictEqual(mapped.id, "att_1");
    assert.strictEqual(mapped.attemptNumber, 1);
    assert.strictEqual(mapped.score, 88);
    assert.strictEqual(mapped.passed, true);
  });
});
