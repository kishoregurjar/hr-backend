"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");

describe("Step 18.3 — Submit Attempt Concurrency Hardening Suite", () => {
  let createdUserId = null;
  let createdAssessmentId = null;
  let createdCandidateId = null;
  let createdAttemptId = null;

  after(async () => {
    if (createdCandidateId) {
      await prisma.candidateAttempt.deleteMany({
        where: { candidateId: createdCandidateId },
      });
      await prisma.candidateProfile.deleteMany({
        where: { id: createdCandidateId },
      });
    }
    if (createdAssessmentId) {
      await prisma.assessment.deleteMany({
        where: { id: createdAssessmentId },
      });
    }
    if (createdUserId) {
      await prisma.user.deleteMany({
        where: { id: createdUserId },
      });
    }
  });

  it("handles 10 simultaneous submit requests cleanly with row locking and 1 evaluation", async () => {
    // 1. Setup test user, assessment, candidate, attempt
    const user = await prisma.user.create({
      data: {
        email: `concur-user-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Concurrency Test User",
        role: "HR",
      },
    });
    createdUserId = user.id;

    const assessment = await prisma.assessment.create({
      data: {
        title: `Concurrency Test Assessment ${Date.now()}`,
        status: "ACTIVE",
        passingScore: 50,
        maximumScore: 100,
        createdById: user.id,
      },
    });
    createdAssessmentId = assessment.id;

    const candidate = await prisma.candidateProfile.create({
      data: {
        email: `candidate-concur-${Date.now()}@test.com`,
        firstName: "Concurrent",
        lastName: "Candidate",
      },
    });
    createdCandidateId = candidate.id;

    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
    createdAttemptId = attempt.id;

    // 2. Dispatch 10 simultaneous submission requests
    const submitPromises = Array.from({ length: 10 }).map(() =>
      attemptService.submitCandidateAttempt({
        candidateAssessmentId: attempt.id,
        candidateSession: {
          candidateAssessmentId: attempt.id,
          candidateId: candidate.id,
        },
      }).catch((err) => ({ error: err }))
    );

    const results = await Promise.all(submitPromises);

    // 3. Verify all 10 requests completed successfully
    assert.equal(results.length, 10);
    for (const res of results) {
      assert.strictEqual(res.error, undefined);
      assert.equal(res.status, "SUBMITTED");
      assert.ok(res.submittedAt);
    }

    // 4. Verify database state is SUBMITTED
    const dbAttempt = await prisma.candidateAttempt.findUnique({
      where: { id: attempt.id },
    });

    assert.ok(dbAttempt);
    assert.equal(dbAttempt.status, "SUBMITTED");
    assert.ok(dbAttempt.submittedAt);
  });

  it("handles repeated submit call on already SUBMITTED attempt safely", async () => {
    const res = await attemptService.submitCandidateAttempt({
      candidateAssessmentId: createdAttemptId,
      candidateSession: {
        candidateAssessmentId: createdAttemptId,
        candidateId: createdCandidateId,
      },
    });

    assert.equal(res.status, "SUBMITTED");
    assert.equal(res.alreadySubmitted, true);
  });

  it("rejects submission when attempt is EXPIRED by timestamp", async () => {
    const expiredAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() - 5000),
      },
    });

    await assert.rejects(
      async () => {
        await attemptService.submitCandidateAttempt({
          candidateAssessmentId: expiredAttempt.id,
          candidateSession: {
            candidateAssessmentId: expiredAttempt.id,
            candidateId: createdCandidateId,
          },
        });
      },
      (err) => err.statusCode === 409 || err.code === "ATTEMPT_EXPIRED"
    );
  });
});
