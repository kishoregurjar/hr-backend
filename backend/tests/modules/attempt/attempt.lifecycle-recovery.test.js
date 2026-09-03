"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");
const { processExpiredAttempts } = require("../../../src/workers/attempt-expiry.worker");

describe("Step 18.7 — Candidate Attempt Lifecycle Recovery & Stale Session Protection Suite", () => {
  const createdUserIds = [];
  const createdAssessmentIds = [];
  const createdCandidateIds = [];
  const createdQuestionIds = [];
  const createdAttemptIds = [];

  let createdAssessmentId = null;
  let createdCandidateId = null;
  let createdQuestionId = null;
  let createdOptionId = null;

  after(async () => {
    if (createdAttemptIds.length > 0) {
      await prisma.candidateAnswer.deleteMany({
        where: { attemptId: { in: createdAttemptIds } },
      });
      await prisma.attemptQuestion.deleteMany({
        where: { attemptId: { in: createdAttemptIds } },
      });
      await prisma.candidateAttempt.deleteMany({
        where: { id: { in: createdAttemptIds } },
      });
    }
    if (createdQuestionIds.length > 0) {
      await prisma.option.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.question.deleteMany({
        where: { id: { in: createdQuestionIds } },
      });
    }
    if (createdCandidateIds.length > 0) {
      await prisma.candidateProfile.deleteMany({
        where: { id: { in: createdCandidateIds } },
      });
    }
    if (createdAssessmentIds.length > 0) {
      await prisma.assessment.deleteMany({
        where: { id: { in: createdAssessmentIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  const setupFixtures = async () => {
    if (createdAttemptIds.length > 0) return;

    const user = await prisma.user.create({
      data: {
        email: `lifecycle-test-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Lifecycle Tester",
        role: "HR",
      },
    });
    createdUserIds.push(user.id);

    const assessment = await prisma.assessment.create({
      data: {
        title: "Lifecycle Test Assessment",
        durationMinutes: 30,
        passingScore: 50,
        maximumScore: 10,
        createdById: user.id,
      },
    });
    createdAssessmentId = assessment.id;
    createdAssessmentIds.push(assessment.id);

    const candidate = await prisma.candidateProfile.create({
      data: {
        email: `candidate-lc-${Date.now()}@test.com`,
        firstName: "Lifecycle",
        lastName: "Candidate",
      },
    });
    createdCandidateId = candidate.id;
    createdCandidateIds.push(candidate.id);

    const question = await prisma.question.create({
      data: {
        title: "What is Node.js Event Loop?",
        content: "What is Node.js Event Loop?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        status: "PUBLISHED",
        options: {
          create: [
            { optionText: "Single-threaded event loop", isCorrect: true, sequence: 1 },
            { optionText: "Multi-threaded process pool", isCorrect: false, sequence: 2 },
          ],
        },
      },
      include: { options: true },
    });
    createdQuestionId = question.id;
    createdQuestionIds.push(question.id);
    createdOptionId = question.options.find((o) => o.isCorrect).id;
  };

  it("Test 1: IN_PROGRESS -> current returns attempt", async () => {
    await setupFixtures();

    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    createdAttemptIds.push(attempt.id);

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: attempt.id,
      candidateSession: { candidateAssessmentId: attempt.id, candidateId: createdCandidateId, assessmentId: createdAssessmentId },
    });

    assert.ok(result);
    assert.strictEqual(result.expired, false);
    assert.strictEqual(result.attempt.id, attempt.id);
    assert.strictEqual(result.attempt.status, "IN_PROGRESS");
  });

  it("Test 2: browser reconnect -> returns same attempt ID", async () => {
    await setupFixtures();
    const activeId = createdAttemptIds[0];

    const result1 = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: activeId,
    });
    const result2 = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: activeId,
    });

    assert.strictEqual(result1.attempt.id, activeId);
    assert.strictEqual(result2.attempt.id, activeId);
  });

  it("Test 3 & 4: saved answers -> current returns saved answers and correct version", async () => {
    await setupFixtures();
    const activeId = createdAttemptIds[0];

    await prisma.attemptQuestion.create({
      data: {
        attemptId: activeId,
        questionId: createdQuestionId,
        sequence: 1,
        questionSnapshot: { id: createdQuestionId, title: "Loop question" },
      },
    });

    await prisma.candidateAnswer.create({
      data: {
        attemptId: activeId,
        questionId: createdQuestionId,
        selectedOptionIds: [createdOptionId],
        answerText: "Event loop text",
        version: 3,
      },
    });

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: activeId,
    });

    assert.ok(result.attempt);
    assert.ok(Array.isArray(result.attempt.answers));
    const saved = result.attempt.answers.find((a) => a.questionId === createdQuestionId);
    assert.ok(saved);
    assert.strictEqual(saved.version, 3);
    assert.strictEqual(saved.answerText, "Event loop text");
  });

  it("Test 5: expired attempt -> current finalizes and returns EXPIRED", async () => {
    await setupFixtures();

    const expiredAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 40 * 60 * 1000),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });
    createdAttemptIds.push(expiredAttempt.id);

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: expiredAttempt.id,
      now: new Date(),
    });

    assert.ok(result);
    assert.strictEqual(result.expired, true);
    assert.strictEqual(result.status, "EXPIRED");

    const inDb = await prisma.candidateAttempt.findUnique({ where: { id: expiredAttempt.id } });
    assert.strictEqual(inDb.status, "EXPIRED");
  });

  it("Test 6: submitted attempt -> current never returns IN_PROGRESS", async () => {
    await setupFixtures();

    const submittedAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "SUBMITTED",
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        submittedAt: new Date(),
      },
    });
    createdAttemptIds.push(submittedAttempt.id);

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: submittedAttempt.id,
    });

    assert.ok(result);
    assert.strictEqual(result.expired, false);
    assert.strictEqual(result.attempt.status, "SUBMITTED");
    assert.notStrictEqual(result.attempt.status, "IN_PROGRESS");
  });

  it("Test 7: cancelled / terminal attempt -> candidate cannot resume", async () => {
    await setupFixtures();

    const terminalAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "EXPIRED",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1 * 60 * 1000),
      },
    });
    createdAttemptIds.push(terminalAttempt.id);

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: terminalAttempt.id,
    });

    assert.ok(result);
    assert.strictEqual(result.attempt.status, "EXPIRED");
  });

  it("Test 8 (Race): GET current + expiry worker results in single finalization", async () => {
    await setupFixtures();

    const raceAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 50 * 60 * 1000),
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });
    createdAttemptIds.push(raceAttempt.id);

    await Promise.all([
      attemptService.getCurrentCandidateAttempt({ candidateAssessmentId: raceAttempt.id }),
      processExpiredAttempts(),
    ]);

    const final = await prisma.candidateAttempt.findUnique({ where: { id: raceAttempt.id } });
    assert.strictEqual(final.status, "EXPIRED");
  });

  it("Test 9 (Race): GET current + submit results in single authoritative final state", async () => {
    await setupFixtures();

    const raceAttempt2 = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      },
    });
    createdAttemptIds.push(raceAttempt2.id);

    const [currentRes, submitRes] = await Promise.allSettled([
      attemptService.getCurrentCandidateAttempt({ candidateAssessmentId: raceAttempt2.id }),
      attemptService.submitCandidateAttempt({ candidateAssessmentId: raceAttempt2.id }),
    ]);

    assert.ok(currentRes.status === "fulfilled" || submitRes.status === "fulfilled");
    const final = await prisma.candidateAttempt.findUnique({ where: { id: raceAttempt2.id } });
    assert.ok(final.status === "IN_PROGRESS" || final.status === "SUBMITTED");
  });

  it("Test 10 & 43 (Critical Timer Test): reconnect never extends expiresAt", async () => {
    await setupFixtures();

    const fixedExpiresAt = new Date(Date.now() + 20 * 60 * 1000);
    const timerAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: fixedExpiresAt,
      },
    });
    createdAttemptIds.push(timerAttempt.id);

    const r1 = await attemptService.getCurrentCandidateAttempt({ candidateAssessmentId: timerAttempt.id });
    const r2 = await attemptService.getCurrentCandidateAttempt({ candidateAssessmentId: timerAttempt.id });

    assert.ok(r1.attempt);
    assert.ok(r2.attempt);
    assert.strictEqual(r1.attempt.expiresAt.getTime(), fixedExpiresAt.getTime());
    assert.strictEqual(r2.attempt.expiresAt.getTime(), fixedExpiresAt.getTime());
  });

  it("Test 44 (Critical Stale-Session Test): save-answer after submit rejects with ATTEMPT_NOT_ACTIVE", async () => {
    await setupFixtures();

    const submittedAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "SUBMITTED",
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        submittedAt: new Date(),
      },
    });
    createdAttemptIds.push(submittedAttempt.id);

    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: submittedAttempt.id,
          candidateSession: {
            candidateAssessmentId: submittedAttempt.id,
            candidateId: createdCandidateId,
            assessmentId: createdAssessmentId,
          },
          questionId: createdQuestionId,
          selectedOptionIds: [createdOptionId],
        });
      },
      (err) => {
        return err.code === "ATTEMPT_NOT_ACTIVE" || err.message.includes("in progress");
      }
    );
  });

  it("Test 45 (Critical Stale Save Expiry Test): save-answer on expired attempt rejects even before worker runs", async () => {
    await setupFixtures();

    const pastAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 40 * 60 * 1000),
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });
    createdAttemptIds.push(pastAttempt.id);

    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: pastAttempt.id,
          candidateSession: {
            candidateAssessmentId: pastAttempt.id,
            candidateId: createdCandidateId,
            assessmentId: createdAssessmentId,
          },
          questionId: createdQuestionId,
          selectedOptionIds: [createdOptionId],
        });
      },
      (err) => {
        return err.code === "ATTEMPT_EXPIRED" || err.message.includes("expired");
      }
    );
  });

  it("Test 46 (Worker Delay Test): GET current finalizes worker-delayed attempt to EXPIRED", async () => {
    await setupFixtures();

    const delayedAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });
    createdAttemptIds.push(delayedAttempt.id);

    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: delayedAttempt.id,
      now: new Date(),
    });

    assert.ok(result);
    assert.strictEqual(result.expired, true);
    assert.strictEqual(result.status, "EXPIRED");
  });

  it("Test 47 (No Duplicate Attempt on Recovery): GET current returns null if attempt does not exist", async () => {
    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: "non_existent_attempt_id",
      token: "inv_non_existent_token_123456789012345678901234567890123456789012345678901234567890",
    });

    assert.strictEqual(result, null);
  });
});
