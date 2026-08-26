"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createRequestHash } = require("../../src/utils/request-hash");

describe("Request hash suite", () => {
  it("produces the same hash for equivalent object ordering", () => {
    const first = createRequestHash({
      attemptId: "A1",
      questionId: "Q1",
    });

    const second = createRequestHash({
      questionId: "Q1",
      attemptId: "A1",
    });

    assert.equal(first, second);
  });

  it("produces different hashes for different payloads", () => {
    const first = createRequestHash({
      attemptId: "A1",
    });

    const second = createRequestHash({
      attemptId: "A2",
    });

    assert.notEqual(first, second);
  });
});
