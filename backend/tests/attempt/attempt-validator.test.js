const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  startAttemptBodySchema,
  saveAnswerBodySchema,
  submitAttemptBodySchema,
  submitAttemptSchema,
  createBulkInvitationSchema,
  startAttemptByTokenSchema,
  currentAttemptQuerySchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Assessment Attempt Zod Validation Suite", () => {
  describe("Start Attempt Validation", () => {
    it("accepts empty body", () => {
      const result = startAttemptBodySchema.safeParse({});
      assert.equal(result.success, true);
    });

    it("rejects client-controlled fields via strict mode", () => {
      const result = startAttemptBodySchema.safeParse({
        candidateId: "candidate-1",
        status: "SUBMITTED",
      });
      assert.equal(result.success, false);
    });
  });

  describe("Save Answer Validation", () => {
    it("accepts valid selectedOptionIds array", () => {
      const result = saveAnswerBodySchema.safeParse({
        selectedOptionIds: ["option-1"],
      });
      assert.equal(result.success, true);
    });

    it("accepts valid answerText string", () => {
      const result = saveAnswerBodySchema.safeParse({
        answerText: "Node.js non-blocking I/O event loop.",
      });
      assert.equal(result.success, true);
    });

    it("rejects empty body (neither option nor text provided)", () => {
      const result = saveAnswerBodySchema.safeParse({});
      assert.equal(result.success, false);
    });

    it("rejects request providing both option IDs and text answer", () => {
      const result = saveAnswerBodySchema.safeParse({
        selectedOptionIds: ["option-1"],
        answerText: "Some text",
      });
      assert.equal(result.success, false);
    });

    it("rejects duplicate option IDs", () => {
      const result = saveAnswerBodySchema.safeParse({
        selectedOptionIds: ["option-1", "option-1"],
      });
      assert.equal(result.success, false);
    });

    it("rejects client-provided evaluation fields like isCorrect or score", () => {
      const result = saveAnswerBodySchema.safeParse({
        selectedOptionIds: ["option-1"],
        isCorrect: true,
      });
      assert.equal(result.success, false);
    });
  });

  describe("Submit Attempt Validation", () => {
    it("accepts valid invitation token", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = submitAttemptSchema.safeParse({ token: validToken });
      assert.equal(result.success, true);
    });

    it("rejects client-provided score or passed parameters", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = submitAttemptSchema.safeParse({
        token: validToken,
        score: 100,
        passed: true,
      });
      assert.equal(result.success, false);
    });
  });

  describe("Bulk Candidate Invitation Validation", () => {
    it("accepts valid array of candidate IDs", () => {
      const result = createBulkInvitationSchema.safeParse({
        candidateIds: ["cand-1", "cand-2"],
      });
      assert.equal(result.success, true);
    });

    it("rejects empty candidateIds array", () => {
      const result = createBulkInvitationSchema.safeParse({
        candidateIds: [],
      });
      assert.equal(result.success, false);
    });

    it("rejects duplicate candidate IDs in bulk request", () => {
      const result = createBulkInvitationSchema.safeParse({
        candidateIds: ["cand-1", "cand-1"],
      });
      assert.equal(result.success, false);
    });

    it("rejects candidateIds array exceeding maximum 500 boundary", () => {
      const over500 = Array.from({ length: 501 }, (_, i) => `cand-${i}`);
      const result = createBulkInvitationSchema.safeParse({
        candidateIds: over500,
      });
      assert.equal(result.success, false);
    });
  });

  describe("Start Attempt By Token Validation", () => {
    it("accepts valid 68-char prefixed invitation token", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = startAttemptByTokenSchema.safeParse({
        token: validToken,
      });
      assert.equal(result.success, true);
    });

    it("rejects invalid token without inv_ prefix", () => {
      const invalidToken = "invalid_prefix_" + "a".repeat(50);
      const result = startAttemptByTokenSchema.safeParse({
        token: invalidToken,
      });
      assert.equal(result.success, false);
    });

    it("rejects candidateId or assessmentId in body via strict mode", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = startAttemptByTokenSchema.safeParse({
        token: validToken,
        candidateId: "client-candidate-id",
      });
      assert.equal(result.success, false);
    });
  });

  describe("Current Attempt Query Validation", () => {
    it("accepts valid invitation token query parameter", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = currentAttemptQuerySchema.safeParse({
        token: validToken,
      });
      assert.equal(result.success, true);
    });

    it("rejects invalid token format", () => {
      const result = currentAttemptQuerySchema.safeParse({
        token: "short_token",
      });
      assert.equal(result.success, false);
    });

    it("rejects candidateId in query via strict mode", () => {
      const validToken = "inv_" + "a".repeat(64);
      const result = currentAttemptQuerySchema.safeParse({
        token: validToken,
        candidateId: "cand-123",
      });
      assert.equal(result.success, false);
    });
  });
});
