"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  reserveInboundEvent,
  processInboundEmail,
} = require("../../src/modules/resume/resume.inbound.service");

describe("Inbound Email Idempotency & Retry Suite", () => {
  it("processes Request #1 as NEW and returns 200/duplicate for Requests #2 to #5", async () => {
    const mockEvents = new Map();

    const mockRepo = {
      async createInboundEmailEventSafely(data) {
        const key = `${data.provider}:${data.providerMessageId}`;
        if (mockEvents.has(key)) {
          return null; // Simulate P2002 unique constraint conflict
        }
        const event = { id: `event_${Date.now()}`, ...data };
        mockEvents.set(key, event);
        return event;
      },
      async findInboundEmailEvent(provider, providerMessageId) {
        const key = `${provider}:${providerMessageId}`;
        return mockEvents.get(key) || null;
      },
      async markInboundEmailEventCompleted(id, resumeProcessingId) {
        for (const [key, event] of mockEvents.entries()) {
          if (event.id === id) {
            event.status = "COMPLETED";
            event.resumeProcessingId = resumeProcessingId;
            return event;
          }
        }
      },
    };

    const payload = {
      providerPayload: { provider: "sendgrid" },
      providerMessageId: "msg_unique_1001",
      recipientEmail: "jobs+backend@hirequest.com",
      senderEmail: "candidate@example.com",
      subject: "Application for Backend Developer [JOB: BACKEND-101]",
      subjectCode: "BACKEND-101",
      attachments: [
        {
          filename: "resume.pdf",
          contentType: "application/pdf",
          size: 1000,
          buffer: Buffer.from("%PDF-1.7 mock content"),
        },
      ],
      storageService: {
        async putObject() {
          return { key: "resumes/mock.pdf" };
        },
      },
    };

    // Request #1: First time processing
    const req1 = await reserveInboundEvent({
      provider: "sendgrid",
      providerMessageId: "msg_unique_1001",
      recipientEmail: payload.recipientEmail,
      senderEmail: payload.senderEmail,
      subject: payload.subject,
    });

    assert.equal(req1.type, "NEW");

    // Mark event completed (simulating successful pipeline execution)
    await mockRepo.markInboundEmailEventCompleted(req1.event.id, "res_proc_999");

    // Requests #2, #3, #4, #5: Duplicate provider retries
    for (let i = 2; i <= 5; i++) {
      const retryReq = await reserveInboundEvent({
        provider: "sendgrid",
        providerMessageId: "msg_unique_1001",
        recipientEmail: payload.recipientEmail,
        senderEmail: payload.senderEmail,
        subject: payload.subject,
      });

      assert.equal(retryReq.type, "COMPLETED");
      assert.equal(retryReq.event.status, "COMPLETED");
      assert.equal(retryReq.event.resumeProcessingId, "res_proc_999");
    }
  });
});
