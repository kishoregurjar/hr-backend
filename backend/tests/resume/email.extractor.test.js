"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  verifyMailgunSignature,
  extractSubjectJobCode,
} = require("../../src/modules/resume/email.extractor.service");

describe("Inbound Email Extractor Security Suite", () => {
  it("extracts job code from subject", () => {
    assert.equal(
      extractSubjectJobCode("[JOB:BACKEND_001] Resume"),
      "BACKEND_001"
    );
  });

  it("rejects invalid Mailgun signature", () => {
    assert.throws(
      () =>
        verifyMailgunSignature({
          timestamp: Math.floor(Date.now() / 1000).toString(),
          token: "token",
          signature: "invalid",
          signingKey: "secret",
        }),
      {
        code: "INBOUND_SIGNATURE_INVALID",
      }
    );
  });

  it("accepts valid Mailgun signature", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const token = "token";
    const signature = crypto
      .createHmac("sha256", "secret")
      .update(`${timestamp}${token}`)
      .digest("hex");

    assert.doesNotThrow(() =>
      verifyMailgunSignature({
        timestamp,
        token,
        signature,
        signingKey: "secret",
      })
    );
  });
});
