"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptAuditService = require("../../src/modules/attempt/attempt.audit.service");
const attemptMapper = require("../../src/modules/attempt/attempt.mapper");

describe("Candidate Start-By-Token Performance & Concurrency Suite", () => {
  let origFindInvitationByTokenHash;
  let origFindActiveAttempt;
  let origFindById;
  let origCreateAttempt;
  let origCreateAttemptQuestions;
  let origMarkInvitationOpenedIfUsable;
  let origRecordAttemptAudit;

  beforeEach(() => {
    origFindInvitationByTokenHash = attemptRepository.findInvitationByTokenHash;
    origFindActiveAttempt = attemptRepository.findActiveAttempt;
    origFindById = attemptRepository.findById;
    origCreateAttempt = attemptRepository.createAttempt;
    origCreateAttemptQuestions = attemptRepository.createAttemptQuestions;
    origMarkInvitationOpenedIfUsable = attemptRepository.markInvitationOpenedIfUsable;
    origRecordAttemptAudit = attemptAuditService.recordAttemptAudit;

    // Suppress audit log DB FK errors during unit tests
    attemptAuditService.recordAttemptAudit = async () => {};
  });

  afterEach(() => {
    attemptRepository.findInvitationByTokenHash = origFindInvitationByTokenHash;
    attemptRepository.findActiveAttempt = origFindActiveAttempt;
    attemptRepository.findById = origFindById;
    attemptRepository.createAttempt = origCreateAttempt;
    attemptRepository.createAttemptQuestions = origCreateAttemptQuestions;
    attemptRepository.markInvitationOpenedIfUsable = origMarkInvitationOpenedIfUsable;
    attemptAuditService.recordAttemptAudit = origRecordAttemptAudit;
  });

  it("should start a new assessment attempt successfully for a valid invitation token", async () => {
    const mockRawToken = "inv_valid_test_token_1234567890";
    const tokenHash = attemptMapper.hashInvitationToken(mockRawToken);
    const mockCandidateId = "c_cand_valid_101";
    const mockAssessmentId = "c_ass_valid_101";
    const mockAttemptId = "c_att_new_101";

    let createdAttemptData = null;
    let snapshotCount = 0;
    let invitationMarkedOpened = false;

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_101",
      token: tokenHash,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      candidateId: mockCandidateId,
      assessmentId: mockAssessmentId,
      candidate: {
        id: mockCandidateId,
        email: "candidate.valid@example.com",
        firstName: "Valid",
        lastName: "Candidate",
      },
      assessment: {
        id: mockAssessmentId,
        title: "Full Stack Engineer Assessment",
        status: "PUBLISHED",
        durationMinutes: 60,
        questions: [
          {
            questionId: "q_1",
            sequence: 1,
            question: {
              id: "q_1",
              type: "SINGLE_CHOICE",
              options: [{ id: "opt_1" }, { id: "opt_2" }],
            },
          },
        ],
        games: [],
      },
    });

    attemptRepository.findActiveAttempt = async () => null;
    attemptRepository.countByCandidate = async () => 0;

    attemptRepository.createAttempt = async (data) => {
      createdAttemptData = data;
      return {
        id: mockAttemptId,
        ...data,
        status: "IN_PROGRESS",
      };
    };

    attemptRepository.createAttemptQuestions = async (data) => {
      snapshotCount = data.length;
      return { count: data.length };
    };

    attemptRepository.markInvitationOpenedIfUsable = async () => {
      invitationMarkedOpened = true;
      return true;
    };

    attemptRepository.findById = async () => ({
      id: mockAttemptId,
      assessmentId: mockAssessmentId,
      candidateId: mockCandidateId,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      assessment: {
        id: mockAssessmentId,
        title: "Full Stack Engineer Assessment",
      },
      questions: [
        { id: "q_1", questionId: "q_1", type: "SINGLE_CHOICE" },
      ],
    });

    const result = await attemptService.startAttemptByToken({
      token: mockRawToken,
      candidateSession: { candidateId: mockCandidateId, assessmentId: mockAssessmentId },
    });

    assert.ok(result);
    assert.equal(result.id, mockAttemptId);
    assert.equal(result.status, "IN_PROGRESS");
    assert.equal(snapshotCount, 1, "Must snapshot 1 question");
    assert.equal(invitationMarkedOpened, true, "Must mark invitation opened");
  });

  it("should reject startByToken when invitation is expired", async () => {
    const mockRawToken = "inv_expired_token_1234567890";
    const tokenHash = attemptMapper.hashInvitationToken(mockRawToken);

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_expired",
      token: tokenHash,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      candidateId: "cand_1",
      assessmentId: "ass_1",
    });

    attemptRepository.markInvitationExpired = async () => {};

    await assert.rejects(
      async () => {
        await attemptService.startAttemptByToken({
          token: mockRawToken,
        });
      },
      (err) => {
        return (
          err.name === "ConflictError" ||
          err.code === "TOKEN_EXPIRED" ||
          err.statusCode === 409
        );
      }
    );
  });

  it("should reject startByToken when invitation is already COMPLETED", async () => {
    const mockRawToken = "inv_completed_token_1234567890";
    const tokenHash = attemptMapper.hashInvitationToken(mockRawToken);

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_completed",
      token: tokenHash,
      status: "COMPLETED",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      candidateId: "cand_1",
      assessmentId: "ass_1",
    });

    await assert.rejects(
      async () => {
        await attemptService.startAttemptByToken({
          token: mockRawToken,
        });
      },
      (err) => {
        return (
          err.name === "ConflictError" ||
          err.code === "TOKEN_ALREADY_USED" ||
          err.statusCode === 409
        );
      }
    );
  });

  it("should return existing active attempt on repeated start requests without creating duplicate attempt rows", async () => {
    const mockRawToken = "inv_repeated_start_token_123";
    const tokenHash = attemptMapper.hashInvitationToken(mockRawToken);
    const existingAttemptId = "c_att_already_active_999";

    let createAttemptCalled = false;

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_repeat",
      token: tokenHash,
      status: "OPENED",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      candidateId: "cand_repeat",
      assessmentId: "ass_repeat",
      candidate: { id: "cand_repeat" },
      assessment: { id: "ass_repeat", status: "PUBLISHED", durationMinutes: 60, questions: [{ questionId: "q1", sequence: 1 }] },
    });

    attemptRepository.findActiveAttempt = async () => ({
      id: existingAttemptId,
      status: "IN_PROGRESS",
    });

    attemptRepository.findById = async () => ({
      id: existingAttemptId,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    });

    attemptRepository.createAttempt = async () => {
      createAttemptCalled = true;
    };

    const result = await attemptService.startAttemptByToken({
      token: mockRawToken,
    });

    assert.equal(result.id, existingAttemptId);
    assert.equal(createAttemptCalled, false, "Must NOT create a second attempt row");
  });

  it("should handle 5 concurrent startByToken requests and 2 simultaneous requests for the exact same token cleanly", async () => {
    const mockRawToken = "inv_simultaneous_token_999";
    const tokenHash = attemptMapper.hashInvitationToken(mockRawToken);
    const createdAttemptId = "c_att_simultaneous_single";

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_simultaneous",
      token: tokenHash,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      candidateId: "cand_simultaneous",
      assessmentId: "ass_simultaneous",
      candidate: { id: "cand_simultaneous" },
      assessment: {
        id: "ass_simultaneous",
        status: "PUBLISHED",
        durationMinutes: 60,
        questions: [{ questionId: "q1", sequence: 1 }],
        games: [],
      },
    });

    let sharedAttempt = null;

    attemptRepository.findActiveAttempt = async () => sharedAttempt;

    attemptRepository.createAttempt = async (data) => {
      sharedAttempt = {
        id: createdAttemptId,
        ...data,
        status: "IN_PROGRESS",
      };
      return sharedAttempt;
    };

    attemptRepository.createAttemptQuestions = async () => ({ count: 1 });
    attemptRepository.markInvitationOpenedIfUsable = async () => true;
    attemptRepository.findById = async () => sharedAttempt;

    // Simulate 2 simultaneous requests for the exact same token
    const p1 = attemptService.startAttemptByToken({ token: mockRawToken });
    const p2 = attemptService.startAttemptByToken({ token: mockRawToken });

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.ok(r1);
    assert.ok(r2);
    assert.equal(r1.id, r2.id, "Both simultaneous requests must return the exact same attempt ID");
  });
});
