"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateDirectUploadQuery,
  validateInboundResumePayload,
} = require("../../src/modules/resume/resume.validator");

describe("Resume Validation Suite", () => {
  it("accepts direct upload without jobId", () => {
    const result = validateDirectUploadQuery({});
    assert.deepEqual(result, {});
  });

  it("accepts valid jobId", () => {
    const result = validateDirectUploadQuery({
      jobId: "job_123",
    });
    assert.equal(result.jobId, "job_123");
  });

  it("rejects unknown direct upload fields", () => {
    assert.throws(() =>
      validateDirectUploadQuery({
        candidateId: "candidate_123",
      })
    );
  });

  it("normalizes inbound email", () => {
    const result = validateInboundResumePayload({
      inboundEmail: " JOHN@EXAMPLE.COM ",
    });
    assert.equal(result.inboundEmail, "john@example.com");
  });

  it("rejects invalid inbound email", () => {
    assert.throws(() =>
      validateInboundResumePayload({
        inboundEmail: "not-an-email",
      })
    );
  });
});
