"use strict";

require("dotenv").config();
const { describe, it, beforeEach, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");
const attemptFailureService = require("../../../src/modules/attempt/attempt.failure.service");
const { runConcurrently } = require("../../helpers/concurrency");

describe("Step 18.12 — Chaos Resilience & Failure Injection Suite", () => {
  let user = null;
  let candidate = null;
  let assessment = null;
  let question = null;

  beforeEach(async () => {
    attemptFailureService.clearFailures();
  });

  afterEach(async () => {
    attemptFailureService.clearFailures();
  });

  const setupFixtures = async () => {
    if (assessment) return;

    user = await prisma.user.create({
      data: {
        email: `chaos-user-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`,
        password: "Password123!",
        name: "Chaos Tester",
        role: "HR",
      },
    });

    candidate = await prisma.candidateProfile.create({
      data: {
        email: `chaos-cand-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`,
        firstName: "Chaos",
        lastName: "Candidate",
      },
    });

    assessment = await prisma.assessment.create({
      data: {
        title: `Chaos Assessment ${Date.now()}`,
        durationMinutes: 30,
        passingScore: 50,
        maximumScore: 10,
        createdById: user.id,
      },
    });

    question = await prisma.question.create({
      data: {
        title: "Chaos Question",
        content: "What is JS microtask queue?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        status: "PUBLISHED",
        options: {
          create: [
            { optionText: "Promise callbacks queue", isCorrect: true, sequence: 1 },
            { optionText: "DOM events queue", isCorrect: false, sequence: 2 },
          ],
        },
      },
      include: { options: true },
    });
  };

  after(async () => {
    if (question) {
      await prisma.option.deleteMany({ where: { questionId: question.id } });
      await prisma.question.deleteMany({ where: { id: question.id } });
    }
    if (candidate) {
      await prisma.candidateAnswer.deleteMany({ where: { attempt: { candidateId: candidate.id } } });
      await prisma.attemptQuestion.deleteMany({ where: { attempt: { candidateId: candidate.id } } });
      await prisma.candidateAttempt.deleteMany({ where: { candidateId: candidate.id } });
      await prisma.candidateProfile.deleteMany({ where: { id: candidate.id } });
    }
    if (assessment) {
      await prisma.assessment.deleteMany({ where: { id: assessment.id } });
    }
    if (user) {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("Transaction Rollback: Failure during submit rolls back to IN_PROGRESS cleanly", async () => {
    await setupFixtures();

    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    attemptFailureService.enable("ATTEMPT_AFTER_EVALUATION", new Error("Simulated evaluation crash"));

    await assert.rejects(
      async () => {
        await attemptService.submitCandidateAttempt({
          candidateAssessmentId: attempt.id,
          candidateSession: { candidateAssessmentId: attempt.id, candidateId: candidate.id, assessmentId: assessment.id },
        });
      },
      (err) => err.message === "Simulated evaluation crash"
    );

    const inDb = await prisma.candidateAttempt.findUnique({ where: { id: attempt.id } });
    assert.strictEqual(inDb.status, "IN_PROGRESS");
    assert.strictEqual(inDb.score, null);
    assert.strictEqual(inDb.submittedAt, null);
  });

  it("Concurrency: 10 simultaneous submit calls execute single terminal state transition", async () => {
    await setupFixtures();

    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const results = await runConcurrently(async () => {
      return attemptService.submitCandidateAttempt({
        candidateAssessmentId: attempt.id,
        candidateSession: { candidateAssessmentId: attempt.id, candidateId: candidate.id, assessmentId: assessment.id },
      });
    }, 10);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);

    const firstSubmit = fulfilled.find((r) => r.value.alreadySubmitted === false);
    assert.ok(firstSubmit);

    const inDb = await prisma.candidateAttempt.findUnique({ where: { id: attempt.id } });
    assert.strictEqual(inDb.status, "SUBMITTED");
  });

  it("Submit vs Expiry Race: Simultaneous submit and expiry result in exactly one terminal status", async () => {
    await setupFixtures();

    const raceAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 40 * 60 * 1000),
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    const results = await Promise.allSettled([
      attemptService.submitCandidateAttempt({
        candidateAssessmentId: raceAttempt.id,
        candidateSession: { candidateAssessmentId: raceAttempt.id, candidateId: candidate.id, assessmentId: assessment.id },
      }),
      attemptService.expireAttempt({ attemptId: raceAttempt.id }),
    ]);

    const final = await prisma.candidateAttempt.findUnique({ where: { id: raceAttempt.id } });
    assert.ok(final.status === "SUBMITTED" || final.status === "EXPIRED");
    assert.notStrictEqual(final.status, "IN_PROGRESS");
  });
});
