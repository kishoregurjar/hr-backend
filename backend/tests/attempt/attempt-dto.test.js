const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  toCandidateResponse,
  toCandidateQuestionResponse,
  toCandidateOptionResponse,
  toCandidateAnswerResponse,
  toResultResponse,
  toInvitationResponse,
  toBulkInvitationResponse,
} = require("../../src/modules/attempt/attempt.dto");

describe("Assessment Attempt DTO Data Sanitization Suite", () => {
  it("does not expose isCorrect or explanation in candidate option DTO", () => {
    const result = toCandidateOptionResponse({
      id: "option-1",
      optionText: "Node.js Event Loop",
      sequence: 1,
      isCorrect: true,
      explanation: "Secret answer explanation",
    });

    assert.deepEqual(result, {
      id: "option-1",
      text: "Node.js Event Loop",
      sequence: 1,
    });
    assert.equal(result.isCorrect, undefined);
    assert.equal(result.explanation, undefined);
  });

  it("does not expose evaluation fields in candidate answer DTO", () => {
    const result = toCandidateAnswerResponse({
      id: "answer-1",
      questionId: "question-1",
      selectedOptionIds: ["option-1"],
      answerText: null,
      evaluationStatus: "CORRECT",
      isCorrect: true,
      marksAwarded: 5,
      answeredAt: new Date(),
      updatedAt: new Date(),
    });

    assert.equal(result.isCorrect, undefined);
    assert.equal(result.evaluationStatus, undefined);
    assert.equal(result.marksAwarded, undefined);
  });

  it("exposes candidate-safe question fields without correct option indicators", () => {
    const result = toCandidateQuestionResponse({
      id: "attempt-question-1",
      questionId: "question-1",
      sequence: 1,
      marks: 5,
      negativeMarks: 1,
      question: {
        id: "question-1",
        title: "What is Node.js?",
        description: "Runtime question",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        options: [
          {
            id: "option-1",
            optionText: "Runtime",
            sequence: 1,
            isCorrect: true,
          },
        ],
      },
    });

    assert.equal(result.question.options[0].isCorrect, undefined);
    assert.equal(result.question.options[0].text, "Runtime");
  });

  it("hides score, percentage, and passed fields for IN_PROGRESS attempt DTO", () => {
    const result = toCandidateResponse({
      id: "attempt-1",
      assessmentId: "assessment-1",
      attemptNumber: 1,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      expiresAt: new Date(),
      submittedAt: null,
      cancelledAt: null,
      score: 100,
      percentage: 100,
      passed: true,
      questions: [],
      answers: [],
      assessment: null,
    });

    assert.equal(result.score, undefined);
    assert.equal(result.percentage, undefined);
    assert.equal(result.passed, undefined);
  });

  it("exposes result fields for completed attempt DTO", () => {
    const result = toResultResponse({
      id: "attempt-1",
      assessmentId: "assessment-1",
      attemptNumber: 1,
      status: "SUBMITTED",
      startedAt: new Date(),
      submittedAt: new Date(),
      score: 85,
      percentage: 85.5,
      passed: true,
      questions: [],
      answers: [],
    });

    assert.equal(result.score, 85);
    assert.equal(result.percentage, 85.5);
    assert.equal(result.passed, true);
  });

  it("sanitizes invitation DTO and strictly excludes token and tokenHash", () => {
    const now = new Date();
    const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const result = toInvitationResponse({
      id: "inv-1",
      assessmentId: "assessment-1",
      candidateId: "candidate-1",
      email: "candidate@example.com",
      status: "PENDING",
      token: "inv_secret_raw_token",
      tokenHash: "sha256_secret_hash",
      expiresAt: expiry,
      createdAt: now,
      updatedAt: now,
    });

    assert.deepEqual(result, {
      id: "inv-1",
      assessmentId: "assessment-1",
      candidateId: "candidate-1",
      email: "candidate@example.com",
      status: "PENDING",
      expiresAt: expiry,
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(result.token, undefined);
    assert.equal(result.tokenHash, undefined);
  });

  it("sanitizes bulk invitation DTO and strictly excludes raw tokens and token hashes", () => {
    const bulkData = {
      summary: { total: 2, created: 1, duplicate: 1, failed: 0 },
      results: [
        {
          candidateId: "c1",
          status: "CREATED",
          invitationId: "inv-1",
          email: "c1@test.com",
          rawToken: "inv_raw_token_1",
          tokenHash: "hash_1",
        },
        {
          candidateId: "c2",
          status: "DUPLICATE",
          invitationId: "inv-2",
          email: "c2@test.com",
          rawToken: "inv_raw_token_2",
          tokenHash: "hash_2",
          message: "An active invitation already exists.",
        },
      ],
    };

    const sanitized = toBulkInvitationResponse(bulkData);

    assert.deepEqual(sanitized.summary, { total: 2, created: 1, duplicate: 1, failed: 0 });
    assert.equal(sanitized.results[0].rawToken, undefined);
    assert.equal(sanitized.results[0].tokenHash, undefined);
    assert.equal(sanitized.results[0].invitationId, "inv-1");
    assert.equal(sanitized.results[1].message, "An active invitation already exists.");
  });

  it("sanitizes candidate current attempt response and strictly excludes evaluation fields", () => {
    const { toCandidateCurrentAttemptResponse } = require("../../src/modules/attempt/attempt.dto");
    const result = toCandidateCurrentAttemptResponse({
      id: "attempt-1",
      assessmentId: "assessment-1",
      attemptNumber: 1,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      expiresAt: new Date(),
      submittedAt: null,
      assessment: {
        id: "assessment-1",
        title: "Node.js Test",
        description: "Test description",
        durationMinutes: 60,
        passingScore: 50,
        maximumScore: 100,
        type: "MULTIPLE_CHOICE",
        difficulty: "MEDIUM",
      },
      questions: [
        {
          id: "aq-1",
          questionId: "q-1",
          sequence: 1,
          marks: 5,
          negativeMarks: 1,
          question: {
            id: "q-1",
            title: "Question 1",
            description: "Desc",
            type: "SINGLE_CHOICE",
            difficulty: "EASY",
            options: [{ id: "opt-1", text: "Opt 1", sequence: 1, isCorrect: true }],
          },
          answers: [
            {
              id: "ans-1",
              questionId: "q-1",
              selectedOptionIds: ["opt-1"],
              answerText: null,
              isCorrect: true,
              evaluationStatus: "CORRECT",
              marksAwarded: 5,
              updatedAt: new Date(),
            },
          ],
        },
      ],
    });

    assert.equal(result.questions[0].question.options[0].isCorrect, undefined);
    assert.equal(result.questions[0].answer.isCorrect, undefined);
    assert.equal(result.questions[0].answer.evaluationStatus, undefined);
    assert.equal(result.questions[0].answer.marksAwarded, undefined);
    assert.deepEqual(result.questions[0].answer.selectedOptionIds, ["opt-1"]);
  });
});
