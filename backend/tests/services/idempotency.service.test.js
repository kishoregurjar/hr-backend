"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../src/config/prisma");
const {
  createProcessingRecord,
  getExistingRecord,
  assertRequestMatches,
  assertIdentityMatches,
  clearProcessingRecord,
  executeIdempotent,
} = require("../../src/services/idempotency.service");

describe("Idempotency Service Suite", () => {
  const key1 = `svc-test-1-${Date.now()}`;
  const key2 = `svc-test-2-${Date.now()}`;

  after(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: {
        idempotencyKey: {
          in: [key1, key2],
        },
      },
    });
  });

  it("creates processing record and returns null on duplicate P2002", async () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const rec1 = await createProcessingRecord({
      idempotencyKey: key1,
      userId: "user-1",
      scope: "TEST_SCOPE",
      requestHash: "hash-123",
      expiresAt,
    });

    assert.ok(rec1);
    assert.equal(rec1.status, "PROCESSING");

    const recDup = await createProcessingRecord({
      idempotencyKey: key1,
      userId: "user-1",
      scope: "TEST_SCOPE",
      requestHash: "hash-123",
      expiresAt,
    });

    assert.strictEqual(recDup, null);
  });

  it("validates request hash and identity matching", async () => {
    const existing = await getExistingRecord(key1);
    assert.ok(existing);

    // Matching request hash
    assert.doesNotThrow(() => {
      assertRequestMatches({ existing, requestHash: "hash-123" });
    });

    // Mismatched request hash -> 409 IDEMPOTENCY_KEY_REUSED
    assert.throws(
      () => {
        assertRequestMatches({ existing, requestHash: "hash-DIFFERENT" });
      },
      (err) => err.code === "IDEMPOTENCY_KEY_REUSED" && err.statusCode === 409
    );

    // Matching identity & scope
    assert.doesNotThrow(() => {
      assertIdentityMatches({ existing, userId: "user-1", scope: "TEST_SCOPE" });
    });

    // Mismatched scope -> 409 IDEMPOTENCY_SCOPE_MISMATCH
    assert.throws(
      () => {
        assertIdentityMatches({ existing, userId: "user-1", scope: "OTHER_SCOPE" });
      },
      (err) => err.code === "IDEMPOTENCY_SCOPE_MISMATCH" && err.statusCode === 409
    );

    // Mismatched user -> 409 IDEMPOTENCY_IDENTITY_MISMATCH
    assert.throws(
      () => {
        assertIdentityMatches({ existing, userId: "user-OTHER", scope: "TEST_SCOPE" });
      },
      (err) => err.code === "IDEMPOTENCY_IDENTITY_MISMATCH" && err.statusCode === 409
    );
  });

  it("executes operation idempotently on success and cleans up on failure", async () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    await createProcessingRecord({
      idempotencyKey: key2,
      userId: "user-2",
      scope: "EXEC_TEST",
      requestHash: "hash-exec",
      expiresAt,
    });

    // Execute idempotent operation
    const result = await executeIdempotent({
      idempotencyKey: key2,
      execute: async () => ({ statusCode: 201, response: { success: true, id: "sub-1" } }),
    });

    assert.deepEqual(result, { statusCode: 201, response: { success: true, id: "sub-1" } });

    const completedRecord = await getExistingRecord(key2);
    assert.equal(completedRecord.status, "COMPLETED");
    assert.equal(completedRecord.responseCode, 201);
    assert.deepEqual(completedRecord.responseBody, { success: true, id: "sub-1" });
  });

  it("clears processing record when clearProcessingRecord is invoked", async () => {
    await clearProcessingRecord({ idempotencyKey: key2 });
    const clearedRecord = await getExistingRecord(key2);
    assert.strictEqual(clearedRecord, null);
  });
});
