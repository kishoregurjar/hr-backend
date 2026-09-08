"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseSendGridInbound,
  parseMailgunInbound,
  parseSesInbound,
  extractSubjectJobCode,
} = require("../../src/modules/resume/email.extractor.service");

describe("Inbound Email End-to-End Integration Suite", () => {
  it("parses SendGrid inbound webhook payload correctly", () => {
    const mockReq = {
      body: {
        from: "John Candidate <john@example.com>",
        to: "jobs+backend-lead@hirequest.com",
        subject: "Application for Senior Engineer [JOB: BACKEND_999]",
        headers: "Message-ID: <sendgrid_msg_999@sendgrid.me>",
      },
      files: [
        {
          originalname: "john_resume.pdf",
          mimetype: "application/pdf",
          size: 150000,
          buffer: Buffer.from("%PDF-1.7 mock buffer"),
        },
      ],
    };

    const parsed = parseSendGridInbound(mockReq);

    assert.equal(parsed.provider, "sendgrid");
    assert.equal(parsed.providerMessageId, "<sendgrid_msg_999@sendgrid.me>");
    assert.equal(parsed.senderEmail, "john@example.com");
    assert.equal(parsed.recipientEmail, "jobs+backend-lead@hirequest.com");
    assert.equal(parsed.subject, "Application for Senior Engineer [JOB: BACKEND_999]");
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0].filename, "john_resume.pdf");
  });

  it("extracts subject job code from bracketed and prefixed formats", () => {
    assert.equal(extractSubjectJobCode("Resume for [JOB: NODE-2026]"), "NODE-2026");
    assert.equal(extractSubjectJobCode("Application JOB-CODE: REACT-404"), "REACT-404");
    assert.equal(extractSubjectJobCode("General Resume Submission"), null);
  });

  it("parses SES receiving notification payload", () => {
    const notification = {
      notificationType: "Received",
      mail: {
        messageId: "ses_msg_555",
        commonHeaders: {
          from: ["candidate@domain.com"],
          to: ["inbound@hirequest.com"],
          subject: "SES Resume Upload",
        },
      },
    };

    const attachments = [
      {
        filename: "resume.pdf",
        contentType: "application/pdf",
        size: 50000,
        buffer: Buffer.from("%PDF-1.7 sample"),
      },
    ];

    const parsed = parseSesInbound({ notification, attachments });

    assert.equal(parsed.provider, "ses");
    assert.equal(parsed.providerMessageId, "ses_msg_555");
    assert.equal(parsed.senderEmail, "candidate@domain.com");
    assert.equal(parsed.recipientEmail, "inbound@hirequest.com");
  });
});
