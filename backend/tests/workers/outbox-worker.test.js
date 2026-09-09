"use strict";

/**
 * Outbox Worker Unit Tests
 * Tests retry logic, exponential backoff, and permanent failure.
 * Uses a mock Redis publisher — no real Redis needed.
 *
 * Run: node --test tests/workers/outbox-worker.test.js
 */

require("../helpers/test-env");

const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateNextAvailableAt } = require("../../src/modules/company/company.outbox.service");
const { COMPANY_OUTBOX_CONSTANTS } = require("../../src/modules/company/company.outbox.constants");

// ─── Retry Delay Calculation ──────────────────────────────────────────────────

test("calculateNextAvailableAt returns a future date", () => {
  const before = Date.now();
  const result = calculateNextAvailableAt(1);
  assert.ok(result instanceof Date);
  assert.ok(result.getTime() > before, "availableAt must be in the future");
});

test("retry delay grows with attempts (exponential backoff)", () => {
  const at1 = calculateNextAvailableAt(1).getTime();
  const at2 = calculateNextAvailableAt(2).getTime();
  const at3 = calculateNextAvailableAt(3).getTime();
  const now = Date.now();

  assert.ok(at2 > at1, "attempt 2 delay must exceed attempt 1");
  assert.ok(at3 > at2, "attempt 3 delay must exceed attempt 2");

  // All must be future
  assert.ok(at1 > now);
  assert.ok(at2 > now);
  assert.ok(at3 > now);
});

test("retry delay is capped at MAX_DELAY_SECONDS", () => {
  const maxMs =
    COMPANY_OUTBOX_CONSTANTS.RETRY.MAX_DELAY_SECONDS * 1000 * 1.25; // +25% for jitter

  const highAttempt = calculateNextAvailableAt(99).getTime();
  const now = Date.now();

  assert.ok(
    highAttempt - now <= maxMs,
    `delay at attempt 99 must not exceed max (${COMPANY_OUTBOX_CONSTANTS.RETRY.MAX_DELAY_SECONDS}s + 25% jitter)`
  );
});

test("attempt 1 delay is roughly BASE_DELAY_SECONDS", () => {
  const base = COMPANY_OUTBOX_CONSTANTS.RETRY.BASE_DELAY_SECONDS * 1000;
  const jitterBudget = base * COMPANY_OUTBOX_CONSTANTS.RETRY.JITTER_RATIO * 1000;

  const result = calculateNextAvailableAt(1).getTime();
  const diff = result - Date.now();

  assert.ok(diff >= base - 100, `delay should be at least base (${base}ms)`);
  assert.ok(
    diff <= base + jitterBudget + 200,
    `delay should not exceed base + jitter (${base + jitterBudget}ms)`
  );
});

// ─── Outbox Constants Sanity ──────────────────────────────────────────────────

test("COMPANY_OUTBOX_CONSTANTS has required retry fields", () => {
  const { RETRY } = COMPANY_OUTBOX_CONSTANTS;

  assert.ok(typeof RETRY.MAX_ATTEMPTS === "number" && RETRY.MAX_ATTEMPTS > 0);
  assert.ok(typeof RETRY.BASE_DELAY_SECONDS === "number" && RETRY.BASE_DELAY_SECONDS > 0);
  assert.ok(typeof RETRY.MAX_DELAY_SECONDS === "number");
  assert.ok(typeof RETRY.JITTER_RATIO === "number");
  assert.ok(RETRY.MAX_DELAY_SECONDS >= RETRY.BASE_DELAY_SECONDS);
});

test("COMPANY_OUTBOX_CONSTANTS has both event types", () => {
  const { EVENT_TYPES } = COMPANY_OUTBOX_CONSTANTS;
  assert.ok(EVENT_TYPES.COMPANY_INVITATION_EMAIL);
  assert.ok(EVENT_TYPES.COMPANY_OWNER_ACTIVATION_EMAIL);
});

// ─── Outbox Repository Integration (DB required) ─────────────────────────────

test("outbox: claimPendingEvents claims PENDING event and marks it PROCESSING", async () => {
  const { prisma, cleanDatabase, disconnectDatabase } = require("../helpers/test-db");
  const { createCompanyWithOwner } = require("../helpers/test-factory");
  const { claimPendingEvents, markCompleted, markFailed } = require("../../src/modules/company/company.outbox.repository");

  await cleanDatabase();

  const { company } = await createCompanyWithOwner();

  const testAvailableAt = new Date(Date.now() + 300000);
  const testClaimTime = new Date(Date.now() + 600000);

  const event = await prisma.outboxEvent.create({
    data: {
      eventType: "TEST_OUTBOX_EVENT",
      aggregateId: company.id,
      payload: JSON.stringify({ test: true }),
      status: "PENDING",
      availableAt: testAvailableAt,
    },
  });

  const claimed = await claimPendingEvents({ batchSize: 100, staleLockMinutes: 10, now: testClaimTime });

  assert.ok(Array.isArray(claimed));
  const claimedEvent = claimed.find((e) => e.id === event.id);
  assert.ok(claimedEvent, "Event should be claimed");
  assert.strictEqual(claimedEvent.status, "PROCESSING");

  // Mark completed
  await markCompleted(event.id);

  const reloaded = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  assert.strictEqual(reloaded.status, "COMPLETED");
  assert.ok(reloaded.processedAt);

  await disconnectDatabase();
});

test("outbox: markFailed resets to PENDING with future availableAt", async () => {
  const { prisma, cleanDatabase, disconnectDatabase } = require("../helpers/test-db");
  const { createCompanyWithOwner } = require("../helpers/test-factory");
  const { claimPendingEvents, markFailed } = require("../../src/modules/company/company.outbox.repository");

  await cleanDatabase();

  const { company } = await createCompanyWithOwner();

  const testAvailableAt = new Date(Date.now() + 300000);
  const testClaimTime = new Date(Date.now() + 600000);

  const event = await prisma.outboxEvent.create({
    data: {
      eventType: "TEST_OUTBOX_EVENT",
      aggregateId: company.id,
      payload: JSON.stringify({ test: true }),
      status: "PENDING",
      availableAt: testAvailableAt,
    },
  });

  await claimPendingEvents({ batchSize: 100, staleLockMinutes: 10, now: testClaimTime });

  const futureAt = new Date(Date.now() + 30000);
  await markFailed(event.id, {
    attempts: 1,
    availableAt: futureAt,
    lastError: "test error",
  });

  const reloaded = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  assert.strictEqual(reloaded.status, "PENDING");
  assert.ok(reloaded.availableAt.getTime() > Date.now());
  assert.strictEqual(reloaded.lastError, "test error");
  assert.strictEqual(reloaded.lockedAt, null);

  await disconnectDatabase();
});

test("outbox: markPermanentlyFailed sets status FAILED", async () => {
  const { prisma, cleanDatabase, disconnectDatabase } = require("../helpers/test-db");
  const { createCompanyWithOwner } = require("../helpers/test-factory");
  const { claimPendingEvents, markPermanentlyFailed } = require("../../src/modules/company/company.outbox.repository");

  await cleanDatabase();

  const { company } = await createCompanyWithOwner();

  const testAvailableAt = new Date(Date.now() + 300000);
  const testClaimTime = new Date(Date.now() + 600000);

  const event = await prisma.outboxEvent.create({
    data: {
      eventType: "TEST_OUTBOX_EVENT",
      aggregateId: company.id,
      payload: JSON.stringify({ test: true }),
      status: "PENDING",
      availableAt: testAvailableAt,
    },
  });

  await claimPendingEvents({ batchSize: 100, staleLockMinutes: 10, now: testClaimTime });

  await markPermanentlyFailed(event.id, {
    attempts: COMPANY_OUTBOX_CONSTANTS.RETRY.MAX_ATTEMPTS,
    lastError: "permanent failure",
  });

  const reloaded = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  assert.strictEqual(reloaded.status, "FAILED");
  assert.strictEqual(reloaded.lockedAt, null);
  assert.strictEqual(reloaded.lastError, "permanent failure");
});
