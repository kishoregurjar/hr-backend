"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  verifyWebhookSignature,
  isSupportedAttachment,
  normalizeInboundEmail,
} = require("../../../src/modules/resume/email.extractor.service");

describe("Resume Inbound Email Extractor Suite", () => {
  it("should verify a valid webhook HMAC signature", () => {
    const body = Buffer.from(
      JSON.stringify({
        from: "candidate@example.com",
      })
    );

    const secret = "test-secret";

    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    assert.equal(
      verifyWebhookSignature({
        rawBody: body,
        signature,
        secret,
      }),
      true
    );
  });

  it("should reject invalid webhook signature", () => {
    const body = Buffer.from("payload");

    assert.equal(
      verifyWebhookSignature({
        rawBody: body,
        signature: "invalid",
        secret: "secret",
      }),
      false
    );
  });

  it("should accept supported resume PDF attachment", () => {
    assert.equal(
      isSupportedAttachment({
        mimeType: "application/pdf",
        size: 1000,
      }),
      true
    );
  });

  it("should reject oversized attachment (> 5MB)", () => {
    assert.equal(
      isSupportedAttachment({
        mimeType: "application/pdf",
        size: 6 * 1024 * 1024,
      }),
      false
    );
  });

  it("should normalize inbound email payload", () => {
    const result = normalizeInboundEmail({
      from: "Candidate@Example.com",
      subject: "Application for Backend Role",
      text: "Hello team, please find attached my resume.",
      attachments: [],
    });

    assert.equal(result.sender, "candidate@example.com");
    assert.equal(result.subject, "Application for Backend Role");
  });
});
