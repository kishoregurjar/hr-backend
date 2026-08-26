"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { saveAnswerSchema } = require("../../src/modules/attempt/attempt.validator");

describe("Step 12 — Real-Time Answer Autosave Suite", () => {
  it("should validate valid single choice save answer payload with attemptQuestionId", () => {
    const result = saveAnswerSchema.safeParse({
      attemptQuestionId: "aq_123",
      selectedOptionIds: ["opt_456"],
    });
    assert.equal(result.success, true);
  });

  it("should validate valid subjective save answer payload with attemptQuestionId", () => {
    const result = saveAnswerSchema.safeParse({
      attemptQuestionId: "aq_789",
      answerText: "Node.js uses non-blocking I/O model.",
    });
    assert.equal(result.success, true);
  });

  it("should reject payload without attemptQuestionId or questionId", () => {
    const result = saveAnswerSchema.safeParse({
      selectedOptionIds: ["opt_123"],
    });
    assert.equal(result.success, false);
  });

  it("should reject payload providing both selectedOptionIds and answerText", () => {
    const result = saveAnswerSchema.safeParse({
      attemptQuestionId: "aq_123",
      selectedOptionIds: ["opt_123"],
      answerText: "Some text answer",
    });
    assert.equal(result.success, false);
  });

  it("should expose saveCandidateAnswer service method", () => {
    assert.equal(typeof attemptService.saveCandidateAnswer, "function");
  });
});
