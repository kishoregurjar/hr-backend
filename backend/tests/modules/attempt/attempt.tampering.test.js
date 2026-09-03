"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");

describe("Attempt Tampering Protection Suite", () => {
  const createdUserIds = [];
  const createdAssessmentIds = [];
  const createdCandidateIds = [];
  const createdQuestionIds = [];
  const createdAttemptIds = [];

  let assessment1Id = null;
  let assessment2Id = null;
  let candidateId = null;
  let question1Id = null;
  let question2Id = null;
  let option1Id = null;

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

  const setupTamperingFixtures = async () => {
    if (createdAttemptIds.length > 0) return;

    const user = await prisma.user.create({
      data: {
        email: `tamper-test-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Tampering Tester",
        role: "HR",
      },
    });
    createdUserIds.push(user.id);

    const a1 = await prisma.assessment.create({
      data: { title: "Assessment Alpha", durationMinutes: 30, passingScore: 50, maximumScore: 10, createdById: user.id },
    });
    assessment1Id = a1.id;
    createdAssessmentIds.push(a1.id);

    const a2 = await prisma.assessment.create({
      data: { title: "Assessment Beta", durationMinutes: 30, passingScore: 50, maximumScore: 10, createdById: user.id },
    });
    assessment2Id = a2.id;
    createdAssessmentIds.push(a2.id);

    const candidate = await prisma.candidateProfile.create({
      data: { email: `tamper-cand-${Date.now()}@test.com`, firstName: "Tamper", lastName: "Candidate" },
    });
    candidateId = candidate.id;
    createdCandidateIds.push(candidate.id);

    const q1 = await prisma.question.create({
      data: {
        title: "Alpha Question",
        content: "Alpha Question",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        status: "PUBLISHED",
        options: { create: [{ optionText: "A1", isCorrect: true, sequence: 1 }] },
      },
      include: { options: true },
    });
    question1Id = q1.id;
    createdQuestionIds.push(q1.id);
    option1Id = q1.options[0].id;

    const q2 = await prisma.question.create({
      data: {
        title: "Beta Question",
        content: "Beta Question",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        status: "PUBLISHED",
        options: { create: [{ optionText: "B1", isCorrect: true, sequence: 1 }] },
      },
    });
    question2Id = q2.id;
    createdQuestionIds.push(q2.id);
  };

  it("Test 1: rejects question outside attempt snapshot", async () => {
    await setupTamperingFixtures();

    const attemptA = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment1Id,
        candidateId: candidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    createdAttemptIds.push(attemptA.id);

    await prisma.attemptQuestion.create({
      data: {
        attemptId: attemptA.id,
        questionId: question1Id,
        sequence: 1,
        questionSnapshot: { id: question1Id, title: "Alpha Question" },
      },
    });

    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: attemptA.id,
          candidateSession: { candidateAssessmentId: attemptA.id, candidateId, assessmentId: assessment1Id },
          questionId: question2Id,
          selectedOptionIds: [option1Id],
        });
      },
      (err) => {
        return err.code === "QUESTION_NOT_IN_ATTEMPT" || err.code === "ATTEMPT_QUESTION_NOT_FOUND" || err.message.includes("not found");
      }
    );
  });

  it("Test 2: rejects save-answer after attempt expiry", async () => {
    await setupTamperingFixtures();

    const expiredAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment1Id,
        candidateId: candidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 40 * 60 * 1000),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });
    createdAttemptIds.push(expiredAttempt.id);

    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: expiredAttempt.id,
          candidateSession: { candidateAssessmentId: expiredAttempt.id, candidateId, assessmentId: assessment1Id },
          questionId: question1Id,
          selectedOptionIds: [option1Id],
        });
      },
      (err) => {
        return err.code === "ATTEMPT_EXPIRED" || err.message.includes("expired");
      }
    );
  });

  it("Test 3: rejects save-answer after attempt submission", async () => {
    await setupTamperingFixtures();

    const submittedAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment1Id,
        candidateId: candidateId,
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
          candidateSession: { candidateAssessmentId: submittedAttempt.id, candidateId, assessmentId: assessment1Id },
          questionId: question1Id,
          selectedOptionIds: [option1Id],
        });
      },
      (err) => {
        return err.code === "ATTEMPT_NOT_ACTIVE" || err.message.includes("in progress");
      }
    );
  });

  it("Test 4: ignores client-supplied marks and evaluates server-side", async () => {
    await setupTamperingFixtures();

    const activeAttempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment1Id,
        candidateId: candidateId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    createdAttemptIds.push(activeAttempt.id);

    await prisma.attemptQuestion.create({
      data: {
        attemptId: activeAttempt.id,
        questionId: question1Id,
        sequence: 1,
        questionSnapshot: { id: question1Id, title: "Alpha Question" },
      },
    });

    const saved = await attemptService.saveCandidateAnswer({
      candidateAssessmentId: activeAttempt.id,
      candidateSession: { candidateAssessmentId: activeAttempt.id, candidateId, assessmentId: assessment1Id },
      questionId: question1Id,
      selectedOptionIds: [option1Id],
      marks: 9999,
      isCorrect: true,
      score: 100,
    });

    assert.ok(saved);
    assert.strictEqual(saved.marks, undefined);
  });
});
