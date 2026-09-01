"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptService = require("../../../src/modules/attempt/attempt.service");

describe("Step 18.4 — Save Answer Concurrency + Optimistic Versioning Suite", () => {
  let createdUserId = null;
  let createdAssessmentId = null;
  let createdCandidateId = null;
  let createdAttemptId = null;
  let createdQuestionId = null;
  let createdOptionId = null;
  let createdAttemptQuestionId = null;

  after(async () => {
    if (createdAttemptId) {
      await prisma.candidateAnswer.deleteMany({
        where: { attemptId: createdAttemptId },
      });
      await prisma.attemptQuestion.deleteMany({
        where: { attemptId: createdAttemptId },
      });
      await prisma.candidateAttempt.deleteMany({
        where: { id: createdAttemptId },
      });
    }
    if (createdQuestionId) {
      await prisma.option.deleteMany({
        where: { questionId: createdQuestionId },
      });
      await prisma.question.deleteMany({
        where: { id: createdQuestionId },
      });
    }
    if (createdCandidateId) {
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

  it("handles answer creation (version 1), atomic version increment, stale conflict rejection, and 10 concurrent autosaves", async () => {
    // 1. Setup user, assessment, candidate, question, option, attempt, and attemptQuestion
    const user = await prisma.user.create({
      data: {
        email: `save-concur-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Save Concurrency User",
        role: "HR",
      },
    });
    createdUserId = user.id;

    const assessment = await prisma.assessment.create({
      data: {
        title: `Save Answer Assessment ${Date.now()}`,
        status: "ACTIVE",
        passingScore: 50,
        maximumScore: 100,
        createdById: user.id,
      },
    });
    createdAssessmentId = assessment.id;

    const candidate = await prisma.candidateProfile.create({
      data: {
        email: `candidate-save-${Date.now()}@test.com`,
        firstName: "Autosave",
        lastName: "Candidate",
      },
    });
    createdCandidateId = candidate.id;

    const question = await prisma.question.create({
      data: {
        title: "What is Node.js?",
        content: "What is Node.js?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        options: {
          create: [
            { optionText: "JS Runtime", isCorrect: true, sequence: 1 },
            { optionText: "Database", isCorrect: false, sequence: 2 },
          ],
        },
      },
      include: {
        options: true,
      },
    });
    createdQuestionId = question.id;
    createdOptionId = question.options[0].id;

    const attempt = await prisma.candidateAttempt.create({
      data: {
        assessmentId: assessment.id,
        candidateId: candidate.id,
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
    createdAttemptId = attempt.id;

    const attemptQuestion = await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        sequence: 1,
        questionSnapshot: {},
      },
    });
    createdAttemptQuestionId = attemptQuestion.id;

    const sessionObj = {
      candidateAssessmentId: attempt.id,
      candidateId: candidate.id,
      assessmentId: assessment.id,
    };

    // Test 1: First answer save -> creates answer record with version = 1
    const firstResult = await attemptService.saveCandidateAnswer({
      candidateAssessmentId: attempt.id,
      candidateSession: sessionObj,
      attemptQuestionId: attemptQuestion.id,
      questionId: question.id,
      selectedOptionIds: [createdOptionId],
      version: 1,
    });

    assert.equal(firstResult.version, 1);

    // Test 2: Normal update with version = 1 -> updates answer and increments version to 2
    const secondResult = await attemptService.saveCandidateAnswer({
      candidateAssessmentId: attempt.id,
      candidateSession: sessionObj,
      attemptQuestionId: attemptQuestion.id,
      questionId: question.id,
      selectedOptionIds: [createdOptionId],
      version: 1,
    });

    assert.equal(secondResult.version, 2);

    // Test 3: Stale version update with version = 1 (when DB version is 2) -> throws ANSWER_VERSION_CONFLICT (409)
    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: attempt.id,
          candidateSession: sessionObj,
          attemptQuestionId: attemptQuestion.id,
          questionId: question.id,
          selectedOptionIds: [createdOptionId],
          version: 1,
        });
      },
      (err) => {
        assert.equal(err.code, "ANSWER_VERSION_CONFLICT");
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Test 4: 10 simultaneous autosave requests with version = 2
    // Exactly 1 request must succeed (updating version to 3) and 9 must be rejected with ANSWER_VERSION_CONFLICT
    const concurPromises = Array.from({ length: 10 }).map(() =>
      attemptService.saveCandidateAnswer({
        candidateAssessmentId: attempt.id,
        candidateSession: sessionObj,
        attemptQuestionId: attemptQuestion.id,
        questionId: question.id,
        selectedOptionIds: [createdOptionId],
        version: 2,
      }).catch((err) => ({ error: err }))
    );

    const concurResults = await Promise.all(concurPromises);
    const successResults = concurResults.filter((r) => !r.error);
    const conflictResults = concurResults.filter(
      (r) => r.error && r.error.code === "ANSWER_VERSION_CONFLICT"
    );

    assert.equal(successResults.length, 1);
    assert.equal(successResults[0].version, 3);
    assert.equal(conflictResults.length, 9);
  });
});
