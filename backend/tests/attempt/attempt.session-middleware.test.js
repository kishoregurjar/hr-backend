"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractBearerToken,
  requireCandidateVerification,
} = require("../../src/modules/attempt/attempt.session.middleware");

const {
  VERIFICATION_SESSION_ERROR_CODES,
} = require("../../src/modules/attempt/attempt.constants");

describe("Candidate Verification Session Middleware Suite", () => {
  it("should extract valid Bearer token string", () => {
    assert.equal(extractBearerToken("Bearer vs_1234567890abcdef"), "vs_1234567890abcdef");
    assert.equal(extractBearerToken("bearer vs_1234567890abcdef"), "vs_1234567890abcdef");
  });

  it("should return null for missing or invalid authorization headers", () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(null), null);
    assert.equal(extractBearerToken("Basic 12345"), null);
    assert.equal(extractBearerToken("Bearer"), null);
    assert.equal(extractBearerToken(""), null);
  });

  it("should reject request with 401 if authorization header is missing", async () => {
    const req = { headers: {} };
    let capturedError = null;

    await requireCandidateVerification(req, {}, (err) => {
      capturedError = err;
    });

    assert.equal(capturedError?.statusCode, 401);
    assert.equal(capturedError?.code, VERIFICATION_SESSION_ERROR_CODES.INVALID_SESSION);
  });

  it("should reject request with 401 if session is not found", async () => {
    const req = {
      headers: { authorization: "Bearer vs_nonexistent_token_1234567890" },
      app: {
        locals: {
          attemptRepository: {
            findActiveVerificationSession: async () => null,
          },
        },
      },
    };
    let capturedError = null;

    await requireCandidateVerification(req, {}, (err) => {
      capturedError = err;
    });

    assert.equal(capturedError?.statusCode, 401);
    assert.equal(capturedError?.code, VERIFICATION_SESSION_ERROR_CODES.SESSION_NOT_FOUND);
  });

  it("should attach req.candidateSession and call next() on valid session", async () => {
    const req = {
      headers: { authorization: "Bearer vs_valid_token_1234567890" },
      app: {
        locals: {
          attemptRepository: {
            findActiveVerificationSession: async () => ({
              id: "vsec_123",
              candidateAssessmentId: "ca_456",
              candidateId: "cand_789",
              assessmentId: "asm_101",
              expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            }),
            touchVerificationSession: async () => {},
          },
        },
      },
    };

    let calledNext = false;
    await requireCandidateVerification(req, {}, (err) => {
      if (!err) calledNext = true;
    });

    assert.equal(calledNext, true);
    assert.equal(req.candidateSession.sessionId, "vsec_123");
    assert.equal(req.candidateSession.candidateAssessmentId, "ca_456");
  });

  it("should reject expired session with 401", async () => {
    const req = {
      headers: { authorization: "Bearer vs_expired_token_1234567890" },
      app: {
        locals: {
          attemptRepository: {
            findActiveVerificationSession: async () => ({
              id: "vsec_123",
              candidateAssessmentId: "ca_456",
              expiresAt: new Date(Date.now() - 1000),
            }),
          },
        },
      },
    };

    let capturedError = null;
    await requireCandidateVerification(req, {}, (err) => {
      capturedError = err;
    });

    assert.equal(capturedError?.statusCode, 401);
    assert.equal(capturedError?.code, VERIFICATION_SESSION_ERROR_CODES.SESSION_EXPIRED);
  });
});
