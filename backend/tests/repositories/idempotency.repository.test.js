"use strict";

require("dotenv").config();
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../src/config/prisma");
const {
  createIdempotencyKey,
  findIdempotencyKey,
  updateIdempotencyKey,
  deleteExpiredIdempotencyKeys,
} = require("../../src/repositories/idempotency.repository");

describe("Idempotency repository suite", () => {
  const testKey = `test-key-${Date.now()}`;
  const duplicateKey = `test-dup-${Date.now()}`;
  const expiredKey = `test-exp-${Date.now()}`;

  after(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: {
        idempotencyKey: {
          in: [testKey, duplicateKey, expiredKey],
        },
      },
    });
  });

  it("creates and retrieves an idempotency record", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const created = await createIdempotencyKey({
      idempotencyKey: testKey,
      userId: null,
      scope: "TEST",
      requestHash: "hash-test-123",
      expiresAt,
    });

    assert.equal(created.idempotencyKey, testKey);
    assert.equal(created.status, "PROCESSING");
    assert.equal(created.scope, "TEST");

    const found = await findIdempotencyKey(testKey);
    assert.ok(found);
    assert.equal(found.requestHash, "hash-test-123");
  });

  it("updates an idempotency record to COMPLETED with response details", async () => {
    const updated = await updateIdempotencyKey({
      idempotencyKey: testKey,
      status: "COMPLETED",
      responseCode: 200,
      responseBody: { success: true, message: "OK" },
    });

    assert.equal(updated.status, "COMPLETED");
    assert.equal(updated.responseCode, 200);
    assert.deepEqual(updated.responseBody, { success: true, message: "OK" });
  });

  it("rejects duplicate primary key creation via database constraint", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await createIdempotencyKey({
      idempotencyKey: duplicateKey,
      userId: "user-1",
      scope: "TEST_DUP",
      requestHash: "hash-1",
      expiresAt,
    });

    await assert.rejects(
      async () => {
        await createIdempotencyKey({
          idempotencyKey: duplicateKey,
          userId: "user-1",
          scope: "TEST_DUP",
          requestHash: "hash-1",
          expiresAt,
        });
      },
      (err) => {
        return err.code === "P2002";
      }
    );
  });

  it("deletes expired idempotency records", async () => {
    const pastExpiresAt = new Date(Date.now() - 1000);

    await createIdempotencyKey({
      idempotencyKey: expiredKey,
      userId: null,
      scope: "EXPIRED_TEST",
      requestHash: "hash-expired",
      expiresAt: pastExpiresAt,
    });

    const deleteResult = await deleteExpiredIdempotencyKeys(new Date());
    assert.ok(deleteResult.count >= 1);

    const found = await findIdempotencyKey(expiredKey);
    assert.strictEqual(found, null);
  });
});
