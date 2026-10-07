"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptAuditService = require("../../src/modules/attempt/attempt.audit.service");

describe("Candidate Save-Answer Performance Optimization & Concurrency Suite", () => {
  let origFindAttemptById;
  let origFindAttemptQuestion;
  let origFindAttemptAnswer;
  let origUpsertAttemptAnswer;
  let origRecordAttemptAudit;

  beforeEach(() => {
    origFindAttemptById = attemptRepository.findAttemptById;
    origFindAttemptQuestion = attemptRepository.findAttemptQuestion;
    origFindAttemptAnswer = attemptRepository.findAttemptAnswer;
    origUpsertAttemptAnswer = attemptRepository.upsertAttemptAnswer;
    origRecordAttemptAudit = attemptAuditService.recordAttemptAudit;

    // Suppress audit log DB FK errors during unit tests
    attemptAuditService.recordAttemptAudit = async () => {};
  });

  afterEach(() => {
    attemptRepository.findAttemptById = origFindAttemptById;
    attemptRepository.findAttemptQuestion = origFindAttemptQuestion;
    attemptRepository.findAttemptAnswer = origFindAttemptAnswer;
    attemptRepository.upsertAttemptAnswer = origUpsertAttemptAnswer;
    attemptAuditService.recordAttemptAudit = origRecordAttemptAudit;
  });

  it("should resolve explicit attemptId in 1 single targeted query without fallback loops", async () => {
    const mockAttemptId = "c_attempt_real_db_id_101";
    const mockCandidateId = "c_cand_user_999";
    const mockQuestionId = "c_q_opt_123";
    const mockAttemptQuestionId = "c_aq_opt_123";

    let findAttemptByIdCount = 0;
    let upsertAnswerCount = 0;

    attemptRepository.findAttemptById = async (id) => {
      findAttemptByIdCount++;
      return {
        id: mockAttemptId,
        candidateId: mockCandidateId,
        assessmentId: "c_ass_123",
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };
    };

    attemptRepository.findAttemptQuestion = async () => ({
      id: mockAttemptQuestionId,
      questionId: mockQuestionId,
      question: {
        type: "SINGLE_CHOICE",
        options: [{ id: "opt_a" }, { id: "opt_b" }],
      },
    });

    attemptRepository.upsertAttemptAnswer = async (data) => {
      upsertAnswerCount++;
      return {
        id: "c_ans_101",
        attemptId: data.attemptId,
        questionId: data.questionId,
        selectedOptionIds: data.selectedOptionIds,
        answerText: data.answerText,
        version: 1,
        updatedAt: new Date(),
      };
    };

    const result = await attemptService.saveCandidateAnswer({
      candidateAssessmentId: mockAttemptId,
      candidateSession: { candidateId: mockCandidateId },
      attemptQuestionId: mockAttemptQuestionId,
      questionId: mockQuestionId,
      selectedOptionIds: ["opt_a"],
    });

    assert.equal(findAttemptByIdCount, 1, "Must execute exactly 1 targeted attempt query");
    assert.equal(upsertAnswerCount, 1, "Must execute 1 atomic upsert");
    assert.equal(result.attemptId, mockAttemptId);
    assert.equal(result.questionId, mockQuestionId);
    assert.equal(result.status, "IN_PROGRESS");
    assert.equal(typeof result.version, "number");
    assert.ok(result.savedAt);
  });

  it("should prevent unauthorized candidate from saving answer to another candidate's attemptId", async () => {
    const mockAttemptId = "c_attempt_candidate_A";

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      candidateId: "c_candidate_A",
      assessmentId: "c_ass_123",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    await assert.rejects(
      async () => {
        await attemptService.saveCandidateAnswer({
          candidateAssessmentId: mockAttemptId,
          candidateSession: { candidateId: "c_candidate_B" },
          attemptQuestionId: "c_aq_123",
          questionId: "c_q_123",
          selectedOptionIds: ["opt_a"],
        });
      },
      (err) => {
        return (
          err.name === "NotFoundError" ||
          err.name === "ForbiddenError" ||
          err.name === "UnauthorizedError" ||
          err.name === "ConflictError" ||
          err.code === "ACTIVE_ATTEMPT_NOT_FOUND"
        );
      }
    );
  });

  it("should handle 5 concurrent save-answer requests safely without deadlocks or version errors", async () => {
    const mockAttemptId = "c_attempt_concurrent_123";
    const mockCandidateId = "c_cand_concurrent_user";
    const answersStore = new Map();

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      candidateId: mockCandidateId,
      assessmentId: "c_ass_conc",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    attemptRepository.findAttemptQuestion = async ({ questionId }) => ({
      id: `c_aq_${questionId}`,
      questionId: questionId || "q1",
      question: {
        type: "SINGLE_CHOICE",
        options: [{ id: "opt_1" }, { id: "opt_2" }],
      },
    });

    attemptRepository.upsertAttemptAnswer = async ({ attemptId, questionId, selectedOptionIds, answerText }) => {
      const key = `${attemptId}:${questionId}`;
      const existing = answersStore.get(key);
      const version = existing ? existing.version + 1 : 1;
      const record = {
        id: `c_ans_${questionId}`,
        attemptId,
        questionId,
        selectedOptionIds,
        answerText,
        version,
        updatedAt: new Date(),
      };
      answersStore.set(key, record);
      return record;
    };

    const questions = ["q1", "q2", "q3", "q4", "q5"];
    const promises = questions.map((qId) =>
      attemptService.saveCandidateAnswer({
        candidateAssessmentId: mockAttemptId,
        candidateSession: { candidateId: mockCandidateId },
        attemptQuestionId: `c_aq_${qId}`,
        questionId: qId,
        selectedOptionIds: ["opt_1"],
      })
    );

    const results = await Promise.all(promises);

    assert.equal(results.length, 5);
    assert.equal(answersStore.size, 5);
    results.forEach((res, idx) => {
      assert.equal(res.attemptId, mockAttemptId);
      assert.equal(res.questionId, questions[idx]);
      assert.equal(res.version, 1);
    });
  });

  it("should handle concurrent updates to the exact same question and increment version atomically", async () => {
    const mockAttemptId = "c_attempt_same_question_123";
    const mockCandidateId = "c_cand_same_q_user";
    const targetQId = "c_q_shared_100";
    const answersStore = new Map();

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      candidateId: mockCandidateId,
      assessmentId: "c_ass_shared",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    attemptRepository.findAttemptQuestion = async () => ({
      id: `c_aq_${targetQId}`,
      questionId: targetQId,
      question: {
        type: "SINGLE_CHOICE",
        options: [{ id: "opt_1" }, { id: "opt_2" }],
      },
    });

    attemptRepository.upsertAttemptAnswer = async ({ attemptId, questionId, selectedOptionIds }) => {
      const key = `${attemptId}:${questionId}`;
      const existing = answersStore.get(key);
      const version = existing ? existing.version + 1 : 1;
      const record = {
        id: `c_ans_${questionId}`,
        attemptId,
        questionId,
        selectedOptionIds,
        version,
        updatedAt: new Date(),
      };
      answersStore.set(key, record);
      return record;
    };

    const p1 = attemptService.saveCandidateAnswer({
      candidateAssessmentId: mockAttemptId,
      candidateSession: { candidateId: mockCandidateId },
      attemptQuestionId: `c_aq_${targetQId}`,
      questionId: targetQId,
      selectedOptionIds: ["opt_1"],
    });

    const p2 = attemptService.saveCandidateAnswer({
      candidateAssessmentId: mockAttemptId,
      candidateSession: { candidateId: mockCandidateId },
      attemptQuestionId: `c_aq_${targetQId}`,
      questionId: targetQId,
      selectedOptionIds: ["opt_2"],
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.ok(r1);
    assert.ok(r2);
    const finalRecord = answersStore.get(`${mockAttemptId}:${targetQId}`);
    assert.ok(finalRecord);
    assert.equal(finalRecord.selectedOptionIds[0], "opt_2");
    assert.equal(finalRecord.version, 2);
  });

  it("should ignore stale save-answer requests when expectedVersion is older than current version", async () => {
    const mockAttemptId = "c_attempt_stale_123";
    const mockCandidateId = "c_cand_stale_user";
    const targetQId = "c_q_stale_100";

    attemptRepository.findAttemptById = async () => ({
      id: mockAttemptId,
      candidateId: mockCandidateId,
      assessmentId: "c_ass_stale",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    attemptRepository.findAttemptQuestion = async () => ({
      id: `c_aq_${targetQId}`,
      questionId: targetQId,
      question: {
        type: "SINGLE_CHOICE",
        options: [{ id: "opt_1" }, { id: "opt_2" }],
      },
    });

    let upsertCalled = false;
    attemptRepository.findAttemptAnswer = async () => ({
      id: "ans_stale",
      attemptId: mockAttemptId,
      questionId: targetQId,
      selectedOptionIds: ["opt_2"],
      version: 5, // DB is already at version 5
      updatedAt: new Date(),
    });

    attemptRepository.upsertAttemptAnswer = async () => {
      upsertCalled = true;
    };

    // Client sends stale request with expectedVersion = 2 (older than 5)
    const result = await attemptService.saveCandidateAnswer({
      candidateAssessmentId: mockAttemptId,
      candidateSession: { candidateId: mockCandidateId },
      attemptQuestionId: `c_aq_${targetQId}`,
      questionId: targetQId,
      selectedOptionIds: ["opt_1"],
      version: 2,
    });

    assert.equal(upsertCalled, false, "Must NOT call upsert for stale request");
    assert.equal(result.version, 5, "Must return current database version 5");
  });
});
