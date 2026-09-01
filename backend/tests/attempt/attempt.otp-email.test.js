"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildCandidateOtpEmail } = require("../../src/modules/attempt/attempt.email");
const { sendEmail, verifyEmailTransport, getTransporter } = require("../../src/utils/email");

describe("Candidate OTP Email Delivery & Template Suite", () => {
  it("should build candidate OTP email with subject, text, and HTML", () => {
    const expiresAt = new Date("2026-08-25T12:00:00.000Z");
    const content = buildCandidateOtpEmail({ otp: "849201", expiresAt });

    assert.equal(content.subject, "HireQuest Assessment Verification Code");
    assert.match(content.text, /849201/);
    assert.match(content.html, /849201/);
    assert.match(content.html, /HireQuest Assessment Verification/);
  });

  it("should expose email utility functions", () => {
    assert.equal(typeof sendEmail, "function");
    assert.equal(typeof verifyEmailTransport, "function");
    assert.equal(typeof getTransporter, "function");
  });

  it("should reject sendEmail if recipient to is missing", async () => {
    await assert.rejects(
      async () => {
        await sendEmail({ subject: "Test", text: "Hello" });
      },
      (err) => {
        assert.equal(err.code, "EMAIL_RECIPIENT_REQUIRED");
        return true;
      }
    );
  });
});
