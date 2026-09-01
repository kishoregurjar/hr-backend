"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");
const attemptMapper = require("../../../src/modules/attempt/attempt.mapper");

describe("Step 18.5 — Start Attempt Concurrency Hardening Suite", () => {
  let createdUserId = null;
  let createdAssessmentId = null;
  let createdCandidateId = null;
  let createdInvitationId = null;
  let createdQuestionId = null;
  let createdAttemptIds = [];

  after(async () => {
    for (const attemptId of createdAttemptIds) {
      await prisma.candidateAnswer.deleteMany({ where: { attemptId } });
      await prisma.attemptQuestion.deleteMany({ where: { attemptId } });
      await prisma.candidateAttempt.deleteMany({ where: { id: attemptId } });
    }
    if (createdInvitationId) {
      await prisma.invitation.deleteMany({ where: { id: createdInvitationId } });
    }
    if (createdQuestionId) {
      await prisma.assessmentQuestion.deleteMany({ where: { questionId: createdQuestionId } });
      await prisma.option.deleteMany({ where: { questionId: createdQuestionId } });
      await prisma.question.deleteMany({ where: { id: createdQuestionId } });
    }
    if (createdCandidateId) {
      await prisma.candidateProfile.deleteMany({ where: { id: createdCandidateId } });
    }
    if (createdAssessmentId) {
      await prisma.assessment.deleteMany({ where: { id: createdAssessmentId } });
    }
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
  });

  it("handles 10 concurrent start-by-token requests atomically", async () => {
    // 1. Create HR User
    const user = await prisma.user.create({
      data: {
        email: `hr-start-${Date.now()}@example.com`,
        password: "hashedpassword",
        role: "HR",
      },
    });
    createdUserId = user.id;

    // 2. Create Assessment
    const assessment = await prisma.assessment.create({
      data: {
        title: "Concurrency Start Assessment",
        status: "ACTIVE",
        durationMinutes: 60,
        createdById: user.id,
      },
    });
    createdAssessmentId = assessment.id;

    // 3. Create Question + Option + AssessmentQuestion
    const question = await prisma.question.create({
      data: {
        title: "What is 2 + 2?",
        content: "Basic arithmetic question",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        status: "PUBLISHED",
        options: {
          create: [
            { optionText: "3", sequence: 1, isCorrect: false },
            { optionText: "4", sequence: 2, isCorrect: true },
          ],
        },
      },
    });
    createdQuestionId = question.id;

    await prisma.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        questionId: question.id,
        orderIndex: 1,
        points: 5,
        negativePoints: 0,
      },
    });

    // 4. Create Candidate
    const candidate = await prisma.candidateProfile.create({
      data: {
        email: `candidate-start-${Date.now()}@example.com`,
        firstName: "Test",
        lastName: "Candidate",
      },
    });
    createdCandidateId = candidate.id;

    // 5. Create Invitation with raw token
    const rawToken = `inv-start-token-${Date.now()}`;
    const tokenHash = attemptMapper.hashInvitationToken(rawToken);

    const invitation = await prisma.invitation.create({
      data: {
        token: tokenHash,
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "SENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    createdInvitationId = invitation.id;

    // 6. Launch 10 simultaneous startAttemptByToken requests
    const startPromises = Array.from({ length: 10 }, () =>
      attemptService.startAttemptByToken({ token: rawToken })
    );

    const results = await Promise.all(startPromises);

    // Verify all 10 requests returned valid attempts
    assert.equal(results.length, 10);

    const attemptIds = new Set(results.map((r) => r.id));
    // Exactly 1 unique attempt should have been created across all 10 calls
    assert.equal(attemptIds.size, 1);

    const createdAttemptId = results[0].id;
    createdAttemptIds.push(createdAttemptId);

    // Verify in DB that only 1 attempt exists for this candidate & assessment
    const attemptsInDb = await prisma.candidateAttempt.findMany({
      where: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
      },
    });
    assert.equal(attemptsInDb.length, 1);

    // Verify question snapshot was created exactly once (1 question snapshot)
    const snapshotsInDb = await prisma.attemptQuestion.findMany({
      where: { attemptId: createdAttemptId },
    });
    assert.equal(snapshotsInDb.length, 1);
  });

  it("rejects invalid invitation token with NotFoundError", async () => {
    await assert.rejects(
      async () => {
        await attemptService.startAttemptByToken({ token: "invalid-nonexistent-token" });
      },
      {
        name: "NotFoundError",
      }
    );
  });
});
