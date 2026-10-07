"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { COMPANY_OUTBOX_CONSTANTS } = require("../../src/modules/company/company.outbox.constants");
const { buildCandidateOtpEmail } = require("../../src/modules/attempt/attempt.email");

describe("Candidate OTP Asynchronous Outbox Optimization Suite", () => {
  it("should define CANDIDATE_OTP_EMAIL in COMPANY_OUTBOX_CONSTANTS", () => {
    assert.equal(
      COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.CANDIDATE_OTP_EMAIL,
      "CANDIDATE_OTP_EMAIL"
    );
  });

  it("should queue CANDIDATE_OTP_EMAIL outbox event when sendCandidateOtp is executed", async () => {
    const mockEmail = "candidate.async@example.com";
    const mockToken = "inv_async_token_123";

    let createdOutboxEvent = null;
    let createdCandidateOtp = null;

    const mockInvitationRepo = {
      findUsableByToken: async () => ({
        id: "inv_123",
        email: mockEmail,
        status: "PENDING",
      }),
    };

    // Stub attemptRepository
    const originalFindRecent = attemptService.findRecentCandidateOtp;
    const originalCreateCandidateOtp = attemptService.createCandidateOtp;

    // Use mock repos via dependency injection / fake transaction object
    const result = await attemptService.sendCandidateOtp(
      {
        email: mockEmail,
        invitationToken: mockToken,
        now: new Date(),
        invitationRepository: mockInvitationRepo,
      },
      {
        // Mock tx object where outboxEvent.create is tracked
        outboxEvent: {
          create: async ({ data }) => {
            createdOutboxEvent = data;
            return { id: "outbox_123", ...data };
          },
        },
        candidateOtp: {
          create: async ({ data }) => {
            createdCandidateOtp = data;
            return { id: "otp_123", ...data };
          },
          findFirst: async () => null,
          count: async () => 0,
        },
      }
    );

    // Verify response contract remains identical
    assert.equal(typeof result.cooldownSeconds, "number");
    assert.ok(result.expiresAt instanceof Date);

    // Verify Outbox Event Payload
    assert.ok(createdOutboxEvent, "Outbox event must be created");
    assert.equal(createdOutboxEvent.eventType, "CANDIDATE_OTP_EMAIL");
    assert.equal(createdOutboxEvent.aggregateId, mockEmail);
    assert.equal(createdOutboxEvent.payload.email, mockEmail);
    assert.ok(createdOutboxEvent.payload.otp, "Payload must contain OTP for worker template");
    assert.equal(typeof createdOutboxEvent.payload.otp, "string");
    assert.equal(createdOutboxEvent.payload.otp.length, 6);

    // Verify OTP Hash persisted in DB, but raw OTP NOT saved in CandidateOtp
    assert.ok(createdCandidateOtp, "CandidateOtp row must be created");
    assert.ok(createdCandidateOtp.otpHash, "CandidateOtp must contain hashed OTP");
    assert.notEqual(createdCandidateOtp.otpHash, createdOutboxEvent.payload.otp, "Raw OTP must be securely hashed in DB");
  });

  it("should generate exact email content using buildCandidateOtpEmail", () => {
    const testOtp = "948201";
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const content = buildCandidateOtpEmail({ otp: testOtp, expiresAt });

    assert.equal(content.subject, "HireQuest Assessment Verification Code");
    assert.ok(content.text.includes(testOtp));
    assert.ok(content.html.includes(testOtp));
    assert.ok(content.html.includes("5 minutes"));
  });
});
