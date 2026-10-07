"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptMapper = require("../../src/modules/attempt/attempt.mapper");
const { hashOtp } = require("../../src/modules/attempt/attempt.constants");

describe("Candidate Verify OTP Performance, Security & Concurrency Suite", () => {
  let origFindInvitationByTokenHash;
  let origFindLatestCandidateOtp;
  let origMarkCandidateOtpVerified;
  let origCreateVerificationSession;

  beforeEach(() => {
    origFindInvitationByTokenHash = attemptRepository.findInvitationByTokenHash;
    origFindLatestCandidateOtp = attemptRepository.findLatestCandidateOtp;
    origMarkCandidateOtpVerified = attemptRepository.markCandidateOtpVerified;
    origCreateVerificationSession = attemptRepository.createVerificationSession;
  });

  afterEach(() => {
    attemptRepository.findInvitationByTokenHash = origFindInvitationByTokenHash;
    attemptRepository.findLatestCandidateOtp = origFindLatestCandidateOtp;
    attemptRepository.markCandidateOtpVerified = origMarkCandidateOtpVerified;
    attemptRepository.createVerificationSession = origCreateVerificationSession;
  });

  it("1. Valid OTP verification creates session and returns tokens", async () => {
    const rawToken = "inv_valid_otp_test_12345678901234567890123456789012";
    const tokenHash = attemptMapper.hashInvitationToken(rawToken);
    const email = "candidate.otp.valid@example.com";
    const otp = "123456";
    const otpHash = hashOtp(otp);

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_101",
      token: tokenHash,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      candidateId: "cand_101",
      assessmentId: "ass_101",
      candidate: { id: "cand_101", email },
    });

    attemptRepository.findLatestCandidateOtp = async () => ({
      id: "otp_record_101",
      email,
      otpHash,
      attemptsCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 600000),
      verifiedAt: null,
    });

    let markVerifiedCalled = false;
    attemptRepository.markCandidateOtpVerified = async () => {
      markVerifiedCalled = true;
      return { count: 1 };
    };

    let sessionCreated = null;
    attemptRepository.createVerificationSession = async (data) => {
      sessionCreated = data;
      return { id: "sess_101", ...data };
    };

    const result = await attemptService.verifyCandidateOtp({
      email,
      otp,
      invitationToken: rawToken,
    });

    assert.equal(result.verified, true);
    assert.ok(result.candidateAccessToken, "Must return candidateAccessToken");
    assert.equal(result.candidateId, "cand_101");
    assert.equal(result.assessmentId, "ass_101");
    assert.equal(markVerifiedCalled, true, "Must call markCandidateOtpVerified");
    assert.ok(sessionCreated, "Must create verification session record");
  });

  it("2. Invalid OTP code rejection with remaining attempts count", async () => {
    const rawToken = "inv_invalid_otp_test_12345678901234567890123456789012";
    const email = "candidate.otp.invalid@example.com";
    const correctOtp = "123456";
    const wrongOtp = "999999";
    const otpHash = hashOtp(correctOtp);

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_102",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      candidateId: "cand_102",
      assessmentId: "ass_102",
      candidate: { id: "cand_102", email },
    });

    attemptRepository.findLatestCandidateOtp = async () => ({
      id: "otp_record_102",
      email,
      otpHash,
      attemptsCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 600000),
      verifiedAt: null,
    });

    attemptRepository.incrementOtpAttempts = async () => ({ count: 1 });

    await assert.rejects(
      async () => {
        await attemptService.verifyCandidateOtp({
          email,
          otp: wrongOtp,
          invitationToken: rawToken,
        });
      },
      (err) => err.statusCode === 400 && err.code === "INVALID_OTP"
    );
  });

  it("3. Expired OTP code rejection", async () => {
    const rawToken = "inv_expired_otp_test_12345678901234567890123456789012";
    const email = "candidate.otp.expired@example.com";
    const otp = "123456";

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_103",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      candidateId: "cand_103",
      assessmentId: "ass_103",
      candidate: { id: "cand_103", email },
    });

    attemptRepository.findLatestCandidateOtp = async () => null; // findLatestCandidateOtp filters by expiresAt > now

    await assert.rejects(
      async () => {
        await attemptService.verifyCandidateOtp({
          email,
          otp,
          invitationToken: rawToken,
        });
      },
      (err) => err.statusCode === 400 && err.code === "OTP_NOT_FOUND"
    );
  });

  it("4. Email mismatch between invitation and verification payload rejection", async () => {
    const rawToken = "inv_mismatch_email_test_12345678901234567890123456789012";
    const emailInInv = "owner@example.com";
    const emailInReq = "attacker@example.com";

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_104",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      candidateId: "cand_104",
      assessmentId: "ass_104",
      candidate: { id: "cand_104", email: emailInInv },
    });

    await assert.rejects(
      async () => {
        await attemptService.verifyCandidateOtp({
          email: emailInReq,
          otp: "123456",
          invitationToken: rawToken,
        });
      },
      (err) => err.statusCode === 400 && err.code === "INVALID_INVITATION"
    );
  });

  it("5. Concurrency: 2, 5, and 10 concurrent verification requests for same OTP hit atomic single-use consume", async () => {
    const rawToken = "inv_concurrent_otp_test_12345678901234567890123456789012";
    const email = "candidate.otp.concurrent@example.com";
    const otp = "123456";
    const otpHash = hashOtp(otp);

    attemptRepository.findInvitationByTokenHash = async () => ({
      id: "c_inv_conc",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      candidateId: "cand_conc",
      assessmentId: "ass_conc",
      candidate: { id: "cand_conc", email },
    });

    attemptRepository.findLatestCandidateOtp = async () => ({
      id: "otp_record_conc",
      email,
      otpHash,
      attemptsCount: 0,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 600000),
      verifiedAt: null,
    });

    let isConsumedInDB = false;
    attemptRepository.markCandidateOtpVerified = async () => {
      if (isConsumedInDB) {
        return { count: 0 };
      }
      isConsumedInDB = true;
      return { count: 1 };
    };

    attemptRepository.createVerificationSession = async (data) => ({ id: "sess_conc", ...data });

    // Fire 5 concurrent verifyCandidateOtp requests with exact same correct OTP
    const promises = Array.from({ length: 5 }, () =>
      attemptService.verifyCandidateOtp({ email, otp, invitationToken: rawToken })
    );

    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly ONE verification request must succeed");
    assert.equal(rejected.length, 4, "Remaining 4 concurrent requests must be rejected");
    for (const r of rejected) {
      assert.equal(r.reason.statusCode, 409);
      assert.equal(r.reason.code, "OTP_ALREADY_VERIFIED");
    }
  });
});
