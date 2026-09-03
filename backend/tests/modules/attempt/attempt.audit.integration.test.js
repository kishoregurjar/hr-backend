"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../../src/config/prisma");
const attemptAuditService = require("../../../src/modules/attempt/attempt.audit.service");
const attemptAuditRepository = require("../../../src/modules/attempt/attempt.audit.repository");

describe("Attempt Audit Integration Suite", () => {
  let createdAttemptId = null;

  after(async () => {
    if (createdAttemptId) {
      await prisma.attemptAuditLog.deleteMany({
        where: { attemptId: createdAttemptId },
      });
    }
  });

  it("records ATTEMPT_STARTED audit event", async () => {
    createdAttemptId = `test-audit-${Date.now()}`;
    
    await attemptAuditService.recordAttemptAudit({
      event: "ATTEMPT_STARTED",
      attemptId: createdAttemptId,
      metadata: { attemptNumber: 1 },
    });

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId: createdAttemptId,
    });

    assert.ok(logs.length > 0);
    assert.strictEqual(logs[0].event, "ATTEMPT_STARTED");
    assert.strictEqual(logs[0].metadata.attemptNumber, 1);
  });

  it("records ATTEMPT_RESUMED audit event", async () => {
    await attemptAuditService.recordAttemptAudit({
      event: "ATTEMPT_RESUMED",
      attemptId: createdAttemptId,
      metadata: { attemptNumber: 1 },
    });

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId: createdAttemptId,
    });

    assert.ok(logs.some((l) => l.event === "ATTEMPT_RESUMED"));
  });

  it("records ANSWER_CREATED and ANSWER_UPDATED audit events", async () => {
    await attemptAuditService.recordAttemptAudit({
      event: "ANSWER_CREATED",
      attemptId: createdAttemptId,
      metadata: { version: 1 },
    });

    await attemptAuditService.recordAttemptAudit({
      event: "ANSWER_UPDATED",
      attemptId: createdAttemptId,
      metadata: { previousVersion: 1, newVersion: 2 },
    });

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId: createdAttemptId,
    });

    assert.ok(logs.some((l) => l.event === "ANSWER_CREATED"));
    assert.ok(logs.some((l) => l.event === "ANSWER_UPDATED"));
  });

  it("records ANSWER_VERSION_CONFLICT security event", async () => {
    await attemptAuditService.recordSecurityEvent({
      event: "ANSWER_VERSION_CONFLICT",
      attemptId: createdAttemptId,
      metadata: { expectedVersion: 1, actualVersion: 2 },
    });

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId: createdAttemptId,
    });

    assert.ok(logs.some((l) => l.event === "ANSWER_VERSION_CONFLICT"));
  });

  it("records ATTEMPT_SUBMITTED audit event", async () => {
    await attemptAuditService.recordAttemptAudit({
      event: "ATTEMPT_SUBMITTED",
      attemptId: createdAttemptId,
      metadata: { attemptNumber: 1 },
    });

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId: createdAttemptId,
    });

    assert.ok(logs.some((l) => l.event === "ATTEMPT_SUBMITTED"));
  });
});
