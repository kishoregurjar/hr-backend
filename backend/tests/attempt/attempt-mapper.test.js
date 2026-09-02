const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  toCreateEntity,
  toAttemptQuestionEntity,
  toAttemptQuestionEntities,
  toAnswerEntity,
  toAnswerUpdateEntity,
  toSubmitEntity,
  normalizeSelectedOptionIds,
  generateInvitationToken,
  hashInvitationToken,
  toCreateInvitationEntity,
} = require("../../src/modules/attempt/attempt.mapper");

describe("Assessment Attempt Mapper & Snapshot Transformation Suite", () => {
  it("creates a server-controlled attempt entity", () => {
    const startedAt = new Date("2026-08-21T10:00:00.000Z");
    const expiresAt = new Date("2026-08-21T11:00:00.000Z");

    const result = toCreateEntity({
      assessmentId: "assessment-1",
      candidateId: "candidate-1",
      attemptNumber: 1,
      startedAt,
      expiresAt,
    });

    assert.equal(result.assessmentId, "assessment-1");
    assert.equal(result.candidateId, "candidate-1");
    assert.equal(result.attemptNumber, 1);
    assert.equal(result.status, "IN_PROGRESS");
    assert.equal(result.startedAt, startedAt);
    assert.equal(result.expiresAt, expiresAt);
    assert.equal(result.score, null);
    assert.equal(result.passed, null);
  });

  it("maps AssessmentQuestion to AttemptQuestion snapshot", () => {
    const result = toAttemptQuestionEntity(
      {
        questionId: "question-1",
        sequence: 1,
        marks: 5,
        negativeMarks: 1,
      },
      "attempt-1"
    );

    assert.deepEqual(result, {
      attemptId: "attempt-1",
      questionId: "question-1",
      sequence: 1,
      marks: 5,
      negativeMarks: 1,
    });
  });

  it("maps multiple assessment questions to attempt question snapshots", () => {
    const result = toAttemptQuestionEntities(
      [
        {
          questionId: "question-1",
          sequence: 1,
          marks: 5,
          negativeMarks: 1,
        },
        {
          questionId: "question-2",
          sequence: 2,
          marks: 10,
          negativeMarks: 2,
        },
      ],
      "attempt-1"
    );

    assert.equal(result.length, 2);
    assert.equal(result[0].questionId, "question-1");
    assert.equal(result[1].questionId, "question-2");
  });

  it("normalizes duplicate and whitespace option IDs", () => {
    const result = normalizeSelectedOptionIds([
      " option-1 ",
      "option-2",
      "option-1",
    ]);

    assert.deepEqual(result, ["option-1", "option-2"]);
  });

  it("maps answer entity", () => {
    const result = toAnswerEntity({
      attemptId: "attempt-1",
      questionId: "question-1",
      selectedOptionIds: ["option-1", "option-2"],
      answerText: undefined,
    });

    assert.deepEqual(result, {
      attemptId: "attempt-1",
      questionId: "question-1",
      selectedOptionIds: ["option-1", "option-2"],
      answerText: null,
    });
  });

  it("does not overwrite unspecified answer fields in update entity", () => {
    const result = toAnswerUpdateEntity({
      selectedOptionIds: ["option-1"],
    });

    assert.deepEqual(result, {
      selectedOptionIds: ["option-1"],
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, "answerText"),
      false
    );
  });

  it("creates submit entity", () => {
    const submittedAt = new Date("2026-08-21T11:00:00.000Z");

    const result = toSubmitEntity({
      score: 72.5,
      percentage: 72.5,
      passed: true,
      submittedAt,
    });

    assert.deepEqual(result, {
      score: 72.5,
      percentage: 72.5,
      passed: true,
      submittedAt,
    });
  });

  it("rejects invalid expiry date earlier than startedAt", () => {
    assert.throws(
      () =>
        toCreateEntity({
          assessmentId: "assessment-1",
          candidateId: "candidate-1",
          attemptNumber: 1,
          startedAt: new Date("2026-08-21T11:00:00.000Z"),
          expiresAt: new Date("2026-08-21T10:00:00.000Z"),
        }),
      /expiresAt must be later than startedAt/
    );
  });

  it("generates a cryptographically secure invitation token with prefix", () => {
    const token = generateInvitationToken();
    assert.equal(typeof token, "string");
    assert.equal(token.startsWith("inv_"), true);
    assert.equal(token.length > 30, true);
  });

  it("hashes invitation token consistently using SHA-256", () => {
    const rawToken = "inv_abc123xyz789";
    const hash1 = hashInvitationToken(rawToken);
    const hash2 = hashInvitationToken(rawToken);

    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64); // SHA-256 hex string length
    assert.equal(hash1, hash2);
  });

  it("creates a persistence-ready invitation entity", () => {
    const futureExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const result = toCreateInvitationEntity({
      assessmentId: "assessment-123",
      candidateId: "candidate-456",
      invitedByUserId: "hr-789",
      email: " CANDIDATE@EXAMPLE.COM ",
      tokenHash: "hashed_token_string_here",
      expiresAt: futureExpiry,
    });

    assert.deepEqual(result, {
      token: "hashed_token_string_here",
      assessmentId: "assessment-123",
      candidateId: "candidate-456",
      status: "PENDING",
      expiresAt: futureExpiry,
    });
  });
});
