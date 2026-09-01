"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  saveAnswerSchema,
} = require("../../src/modules/attempt/attempt.validator");

const validToken = `inv_${"a".repeat(64)}`;

describe("Save Answer Validation", () => {
  it("should accept single choice answer", () => {
    const result = saveAnswerSchema.safeParse({
      token: validToken,
      questionId: "question-1",
      selectedOptionIds: ["option-1"],
    });

    assert.equal(result.success, true);
  });

  it("should accept subjective answer", () => {
    const result = saveAnswerSchema.safeParse({
      token: validToken,
      questionId: "question-1",
      answerText: "This is my answer.",
    });

    assert.equal(result.success, true);
  });

  it("should reject empty answer", () => {
    const result = saveAnswerSchema.safeParse({
      token: validToken,
      questionId: "question-1",
    });

    assert.equal(result.success, false);
  });

  it("should reject both option and text answer", () => {
    const result = saveAnswerSchema.safeParse({
      token: validToken,
      questionId: "question-1",
      selectedOptionIds: ["option-1"],
      answerText: "invalid mixed answer",
    });

    assert.equal(result.success, false);
  });

  it("should reject unexpected fields", () => {
    const result = saveAnswerSchema.safeParse({
      token: validToken,
      questionId: "question-1",
      selectedOptionIds: ["option-1"],
      isCorrect: true,
      marksAwarded: 100,
    });

    assert.equal(result.success, false);
  });

  it("should reject malformed token", () => {
    const result = saveAnswerSchema.safeParse({
      token: "invalid-token",
      questionId: "question-1",
      selectedOptionIds: ["option-1"],
    });

    assert.equal(result.success, false);
  });
});
