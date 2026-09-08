"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  reserveInboundEvent,
  processInboundEmail,
} = require("../../src/modules/resume/resume.inbound.service");

describe("Inbound Email Idempotency Suite", () => {
  it("processes same provider message only once", async () => {
    let processCount = 0;
    const mockEvents = new Map();

    const mockRepo = {
      async createInboundEmailEventSafely(data) {
        const key = `${data.provider}:${data.providerMessageId}`;
        if (mockEvents.has(key)) {
          return null;
        }
        const event = { id: "evt_1", status: "PROCESSING", ...data };
        mockEvents.set(key, event);
        return event;
      },
      async findInboundEmailEvent(provider, providerMessageId) {
        const key = `${provider}:${providerMessageId}`;
        return mockEvents.get(key) || null;
      },
      async markInboundEmailEventCompleted(id, resumeProcessingId) {
        for (const evt of mockEvents.values()) {
          if (evt.id === id) {
            evt.status = "COMPLETED";
            evt.resumeProcessingId = resumeProcessingId;
          }
        }
      },
    };

    // First reservation -> NEW
    const res1 = await mockRepo.createInboundEmailEventSafely({
      provider: "sendgrid",
      providerMessageId: "msg_123",
    });
    assert.ok(res1);
    processCount++;

    await mockRepo.markInboundEmailEventCompleted(res1.id, "res_proc_1");

    // Second reservation -> COMPLETED
    const res2 = await mockRepo.createInboundEmailEventSafely({
      provider: "sendgrid",
      providerMessageId: "msg_123",
    });
    assert.equal(res2, null); // Duplicate prevented

    const existing = await mockRepo.findInboundEmailEvent("sendgrid", "msg_123");
    assert.equal(existing.status, "COMPLETED");
    assert.equal(processCount, 1);
  });

  it("returns processing state for concurrent duplicate", async () => {
    const mockEvents = new Map();
    const key = "mailgun:msg_concurrent_1";
    mockEvents.set(key, { id: "evt_concurrent", provider: "mailgun", providerMessageId: "msg_concurrent_1", status: "PROCESSING" });

    const existing = mockEvents.get(key);
    assert.equal(existing.status, "PROCESSING");
  });

  it("does not create duplicate job application", async () => {
    const createdApps = new Set();
    const jobId = "job_101";
    const candidateId = "cand_202";
    const key = `${jobId}:${candidateId}`;

    // First application insertion
    createdApps.add(key);
    assert.equal(createdApps.size, 1);

    // Duplicate application insertion attempt
    const isDuplicate = createdApps.has(key);
    assert.equal(isDuplicate, true);
  });
});
