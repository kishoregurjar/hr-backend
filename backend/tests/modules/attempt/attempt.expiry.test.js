"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");
const { processExpiredAttempts } = require("../../../src/workers/attempt-expiry.worker");

describe("Step 18.6 — Candidate Attempt Expiry & Auto-Finalization Engine Suite", () => {
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
        email: `expiry-test-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Expiry Tester",
        role: "HR",
      },
    });
    createdUserIds.push(user.id);

    const assessment = await prisma.assessment.create({
      data: {
        title: "Expiry Test Assessment",
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
        email: `candidate-exp-${Date.now()}@test.com`,
        firstName: "Expired",
        lastName: "Candidate",
      },
    });
    createdCandidateId = candidate.id;
    createdCandidateIds.push(candidate.id);

    const question = await prisma.question.create({
      data: {
        title: "What is 2 + 2?",
        content: "What is 2 + 2?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        status: "PUBLISHED",
        options: {
          create: [
            { optionText: "4", isCorrect: true, sequence: 1 },
            { optionText: "5", isCorrect: false, sequence: 2 },
          ],
        },
      },
      include: { options: true },
    });
    createdQuestionId = question.id;
    createdQuestionIds.push(question.id);
    createdOptionId = question.options.find((o) => o.isCorrect).id;
  };

  it("Test 1: expired IN_PROGRESS attempt transitions to EXPIRED with score", async () => {
    await setupFixtures();

    const pastExpiry = new Date(Date.now() - 60 * 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        expiresAt: pastExpiry,
        startedAt: new Date(Date.now() - 31 * 60 * 1000),
      },
    });
    createdAttemptIds.push(attempt.id);

    await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        questionId: createdQuestionId,
        sequence: 1,
        questionSnapshot: {
          id: createdQuestionId,
          title: "What is 2 + 2?",
          type: "SINGLE_CHOICE",
          marks: 10,
          options: [{ id: createdOptionId, optionText: "4", isCorrect: true }],
        },
      },
    });

    const result = await attemptService.expireAttempt({ attemptId: attempt.id });
    assert.strictEqual(result.processed, true);
    assert.strictEqual(result.status, "EXPIRED");

    const updated = await prisma.candidateAttempt.findUnique({
      where: { id: attempt.id },
    });
    assert.strictEqual(updated.status, "EXPIRED");
    assert.notStrictEqual(updated.expiredAt, null);
  });

  it("Test 2: attempt with future expiry returns NOT_EXPIRED and does not process", async () => {
    await setupFixtures();

    const futureExpiry = new Date(Date.now() + 30 * 60 * 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        expiresAt: futureExpiry,
      },
    });
    createdAttemptIds.push(attempt.id);

    const result = await attemptService.expireAttempt({ attemptId: attempt.id });
    assert.strictEqual(result.processed, false);
    assert.strictEqual(result.reason, "NOT_EXPIRED");

    const updated = await prisma.candidateAttempt.findUnique({
      where: { id: attempt.id },
    });
    assert.strictEqual(updated.status, "IN_PROGRESS");
  });

  it("Test 3: already SUBMITTED attempt returns ALREADY_FINALIZED and skips", async () => {
    await setupFixtures();

    const pastExpiry = new Date(Date.now() - 60 * 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "SUBMITTED",
        submittedAt: new Date(),
        expiresAt: pastExpiry,
      },
    });
    createdAttemptIds.push(attempt.id);

    const result = await attemptService.expireAttempt({ attemptId: attempt.id });
    assert.strictEqual(result.processed, false);
    assert.strictEqual(result.reason, "ALREADY_FINALIZED");
  });

  it("Test 4: already EXPIRED attempt returns ALREADY_FINALIZED and skips", async () => {
    await setupFixtures();

    const pastExpiry = new Date(Date.now() - 60 * 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "EXPIRED",
        expiredAt: pastExpiry,
        expiresAt: pastExpiry,
      },
    });
    createdAttemptIds.push(attempt.id);

    const result = await attemptService.expireAttempt({ attemptId: attempt.id });
    assert.strictEqual(result.processed, false);
    assert.strictEqual(result.reason, "ALREADY_FINALIZED");
  });

  it("Test 5: non-existent attempt returns NOT_FOUND", async () => {
    const result = await attemptService.expireAttempt({ attemptId: "non-existent-attempt-id" });
    assert.strictEqual(result.processed, false);
    assert.strictEqual(result.reason, "NOT_FOUND");
  });

  it("Test 6: unanswered questions evaluate to 0 marks and UNANSWERED status", async () => {
    await setupFixtures();

    const pastExpiry = new Date(Date.now() - 60 * 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        expiresAt: pastExpiry,
      },
    });
    createdAttemptIds.push(attempt.id);

    await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        questionId: createdQuestionId,
        sequence: 1,
        questionSnapshot: {
          id: createdQuestionId,
          type: "SINGLE_CHOICE",
          marks: 10,
          options: [{ id: createdOptionId, isCorrect: true }],
        },
      },
    });

    const result = await attemptService.expireAttempt({ attemptId: attempt.id });
    assert.strictEqual(result.processed, true);
    assert.strictEqual(result.result.score, 0);

    const updated = await prisma.candidateAttempt.findUnique({
      where: { id: attempt.id },
    });
    assert.strictEqual(updated.status, "EXPIRED");
    assert.strictEqual(updated.score, 0);
  });

  it("Test 7 (Critical Concurrency): simultaneous expireAttempt and submitAttempt result in exactly one final state", async () => {
    await setupFixtures();

    const pastExpiry = new Date(Date.now() - 1000);
    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: createdAssessmentId,
        candidateId: createdCandidateId,
        status: "IN_PROGRESS",
        expiresAt: pastExpiry,
      },
    });
    createdAttemptIds.push(attempt.id);

    await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        questionId: createdQuestionId,
        sequence: 1,
        questionSnapshot: {
          id: createdQuestionId,
          type: "SINGLE_CHOICE",
          marks: 10,
          options: [{ id: createdOptionId, isCorrect: true }],
        },
      },
    });

    const [expiryRes, submitRes] = await Promise.allSettled([
      attemptService.expireAttempt({ attemptId: attempt.id }),
      attemptService.submitAttempt({ attemptId: attempt.id, candidateId: createdCandidateId }),
    ]);

    const final = await prisma.candidateAttempt.findUnique({
      where: { id: attempt.id },
    });

    assert.ok(final.status === "EXPIRED" || final.status === "SUBMITTED");
    assert.notStrictEqual(final.status, "IN_PROGRESS");
  });

  it("Test 8: worker processExpiredAttempts handles batch processing smoothly", async () => {
    await setupFixtures();

    const stats = await processExpiredAttempts();
    assert.strictEqual(typeof stats.processed, "number");
    assert.strictEqual(typeof stats.skipped, "number");
  });
});
