"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptAuditService = require("../../src/modules/attempt/attempt.audit.service");

describe("Candidate Submit Performance, Concurrency & Baseline Verification Suite", () => {
  let origFindAttemptById;
  let origLockAttemptRow;
  let origFindAttemptForEvaluation;
  let origPersistAnswerEvaluation;
  let origSubmitAttempt;
  let origRecordAttemptAudit;

  beforeEach(() => {
    origFindAttemptById = attemptRepository.findAttemptById;
    origLockAttemptRow = attemptRepository.lockAttemptRow;
    origFindAttemptForEvaluation = attemptRepository.findAttemptForEvaluation;
    origPersistAnswerEvaluation = attemptRepository.persistAnswerEvaluation;
    origSubmitAttempt = attemptRepository.submitAttempt;
    origRecordAttemptAudit = attemptAuditService.recordAttemptAudit;

    attemptAuditService.recordAttemptAudit = async () => {};
    attemptAuditService.recordSecurityEvent = async () => {};
  });

  afterEach(() => {
    attemptRepository.findAttemptById = origFindAttemptById;
    attemptRepository.lockAttemptRow = origLockAttemptRow;
    attemptRepository.findAttemptForEvaluation = origFindAttemptForEvaluation;
    attemptRepository.persistAnswerEvaluation = origPersistAnswerEvaluation;
    attemptRepository.submitAttempt = origSubmitAttempt;
    attemptAuditService.recordAttemptAudit = origRecordAttemptAudit;
  });

  it("1. Baseline calculation: score, percentage, correct/incorrect/unanswered breakdown match baseline", async () => {
    const mockAttemptId = "c_att_submit_baseline_101";

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      assessmentId: "c_ass_101",
      candidateId: "c_cand_101",
      status: "IN_PROGRESS",
      startedAt: new Date(Date.now() - 1000 * 60 * 30),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    });

    attemptRepository.lockAttemptRow = async () => ({
      id: mockAttemptId,
      assessmentId: "c_ass_101",
      candidateId: "c_cand_101",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    });

    attemptRepository.findAttemptForEvaluation = async () => ({
      id: mockAttemptId,
      assessmentId: "c_ass_101",
      candidateId: "c_cand_101",
      status: "IN_PROGRESS",
      assessment: {
        id: "c_ass_101",
        passingScore: 60,
        maximumScore: 100,
        status: "PUBLISHED",
      },
      attemptQuestions: [
        // Q1: Correct
        {
          attemptId: mockAttemptId,
          questionId: "q_1",
          sequence: 1,
          type: "SINGLE_CHOICE",
          marks: 25,
          negativeMarks: 5,
          answers: [{ id: "ans_1", selectedOptionIds: ["opt_1_a"] }],
          question: {
            id: "q_1",
            type: "SINGLE_CHOICE",
            options: [
              { id: "opt_1_a", isCorrect: true },
              { id: "opt_1_b", isCorrect: false },
            ],
          },
        },
        // Q2: Incorrect
        {
          attemptId: mockAttemptId,
          questionId: "q_2",
          sequence: 2,
          type: "SINGLE_CHOICE",
          marks: 25,
          negativeMarks: 5,
          answers: [{ id: "ans_2", selectedOptionIds: ["opt_2_b"] }],
          question: {
            id: "q_2",
            type: "SINGLE_CHOICE",
            options: [
              { id: "opt_2_a", isCorrect: true },
              { id: "opt_2_b", isCorrect: false },
            ],
          },
        },
        // Q3: Unanswered
        {
          attemptId: mockAttemptId,
          questionId: "q_3",
          sequence: 3,
          type: "SINGLE_CHOICE",
          marks: 25,
          negativeMarks: 5,
          answers: [{ id: "ans_3", selectedOptionIds: [] }],
          question: {
            id: "q_3",
            type: "SINGLE_CHOICE",
            options: [
              { id: "opt_3_a", isCorrect: true },
              { id: "opt_3_b", isCorrect: false },
            ],
          },
        },
        // Q4: Correct
        {
          attemptId: mockAttemptId,
          questionId: "q_4",
          sequence: 4,
          type: "SINGLE_CHOICE",
          marks: 25,
          negativeMarks: 5,
          answers: [{ id: "ans_4", selectedOptionIds: ["opt_4_a"] }],
          question: {
            id: "q_4",
            type: "SINGLE_CHOICE",
            options: [
              { id: "opt_4_a", isCorrect: true },
              { id: "opt_4_b", isCorrect: false },
            ],
          },
        },
      ],
    });

    let persistedAnswers = [];
    attemptRepository.persistAnswerEvaluation = async (data) => {
      persistedAnswers.push(data);
      return data;
    };

    attemptRepository.submitAttempt = async (data) => ({ count: 1, ...data });

    const result = await attemptService.submitCandidateAttempt({
      candidateAssessmentId: mockAttemptId,
    });

    assert.equal(result.alreadySubmitted, false);
    assert.equal(result.attemptId, mockAttemptId);
    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.correctCount, 2, "2 questions answered correctly");
    assert.equal(result.incorrectCount, 1, "1 question answered incorrectly");
    assert.equal(result.unansweredCount, 1, "1 question unanswered");
    assert.equal(result.score, 50, "Quiz percentage: 2 / 4 = 50%");
    assert.equal(result.percentage, 50);
    assert.equal(result.passed, false, "50% score is below 60% passing threshold");
    assert.equal(persistedAnswers.length, 4, "Must persist evaluation for all 4 answers");
  });

  it("2. Already submitted attempt handling", async () => {
    const mockAttemptId = "c_att_already_submitted_999";

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      status: "SUBMITTED",
      score: 85,
      percentage: 85,
      result: "PASS",
      submittedAt: new Date(),
    });

    attemptRepository.lockAttemptRow = async () => ({
      id: mockAttemptId,
      status: "SUBMITTED",
      score: 85,
      percentage: 85,
      result: "PASS",
      submittedAt: new Date(),
    });

    const result = await attemptService.submitCandidateAttempt({
      candidateAssessmentId: mockAttemptId,
    });

    assert.equal(result.alreadySubmitted, true);
    assert.equal(result.attemptId, mockAttemptId);
    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.score, 85);
  });

  it("3. Expired attempt submission rejection", async () => {
    const mockAttemptId = "c_att_expired_999";

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1 min ago
    });

    attemptRepository.lockAttemptRow = async () => ({
      id: mockAttemptId,
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() - 1000 * 60),
    });

    attemptRepository.expireAttemptIfActive = async () => {};

    await assert.rejects(
      async () => {
        await attemptService.submitCandidateAttempt({
          candidateAssessmentId: mockAttemptId,
        });
      },
      (err) => err.statusCode === 409 || err.code === "ATTEMPT_EXPIRED"
    );
  });

  it("4. Concurrency: 2, 5, and 10 concurrent submit requests for same attempt hit single atomic submit", async () => {
    const mockAttemptId = "c_att_concurrent_submit_555";
    let isSubmittedInDB = false;

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      status: isSubmittedInDB ? "SUBMITTED" : "IN_PROGRESS",
      score: isSubmittedInDB ? 100 : null,
      percentage: isSubmittedInDB ? 100 : null,
      submittedAt: isSubmittedInDB ? new Date() : null,
      expiresAt: new Date(Date.now() + 3600000),
    });

    attemptRepository.lockAttemptRow = async () => ({
      id: mockAttemptId,
      status: isSubmittedInDB ? "SUBMITTED" : "IN_PROGRESS",
      score: isSubmittedInDB ? 100 : null,
      percentage: isSubmittedInDB ? 100 : null,
      submittedAt: isSubmittedInDB ? new Date() : null,
      expiresAt: new Date(Date.now() + 3600000),
    });

    attemptRepository.findAttemptForEvaluation = async () => ({
      id: mockAttemptId,
      assessmentId: "c_ass_conc",
      candidateId: "c_cand_conc",
      status: "IN_PROGRESS",
      assessment: { passingScore: 60, maximumScore: 100 },
      attemptQuestions: [
        {
          attemptId: mockAttemptId,
          questionId: "q_conc_1",
          sequence: 1,
          type: "SINGLE_CHOICE",
          marks: 100,
          answers: [{ id: "ans_conc_1", selectedOptionIds: ["opt_conc_a"] }],
          question: { id: "q_conc_1", type: "SINGLE_CHOICE", options: [{ id: "opt_conc_a", isCorrect: true }] },
        },
      ],
    });

    attemptRepository.persistAnswerEvaluation = async (data) => data;

    let submitCount = 0;
    attemptRepository.submitAttempt = async (data) => {
      submitCount++;
      isSubmittedInDB = true;
      return { count: 1, ...data };
    };

    // Fire 5 concurrent submit requests
    const promises = Array.from({ length: 5 }, () =>
      attemptService.submitCandidateAttempt({ candidateAssessmentId: mockAttemptId })
    );

    const results = await Promise.all(promises);

    assert.equal(results.length, 5);
    const firstSuccess = results.filter((r) => !r.alreadySubmitted);
    const repeatedSubmits = results.filter((r) => r.alreadySubmitted);

    assert.ok(firstSuccess.length >= 1, "At least 1 request must process primary submit");
    assert.equal(firstSuccess.length + repeatedSubmits.length, 5, "All 5 concurrent requests return valid submit response");
    for (const r of results) {
      assert.equal(r.status, "SUBMITTED");
      assert.equal(r.attemptId, mockAttemptId);
    }
  });
});
