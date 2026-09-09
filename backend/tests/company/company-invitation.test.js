"use strict";

/**
 * Invitation duplicate protection + race condition tests.
 * Tests DB-level constraint (partial unique index) not just app-level logic.
 *
 * Run: node --test tests/company/company-invitation.test.js
 */

require("../helpers/test-env");

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { prisma, cleanDatabase, disconnectDatabase } = require("../helpers/test-db");
const { createCompanyWithOwner, createInvitation } = require("../helpers/test-factory");
const { runConcurrently, countFulfilled } = require("../helpers/concurrency");

test.beforeEach(async () => {
  await cleanDatabase();
});

test.after(async () => {
  await disconnectDatabase();
});

// ─── Duplicate Invitation DB Constraint ──────────────────────────────────────

test("only one PENDING invitation per company+email allowed (DB constraint)", async () => {
  const { company } = await createCompanyWithOwner();
  const email = "candidate@example.com";
  const expiresAt = new Date(Date.now() + 86400000);

  const results = await Promise.allSettled([
    prisma.companyInvitation.create({
      data: {
        companyId: company.id,
        email,
        role: "RECRUITER",
        tokenHash: crypto.randomBytes(32).toString("hex"),
        encryptedToken: "token-a",
        expiresAt,
      },
    }),
    prisma.companyInvitation.create({
      data: {
        companyId: company.id,
        email,
        role: "RECRUITER",
        tokenHash: crypto.randomBytes(32).toString("hex"),
        encryptedToken: "token-b",
        expiresAt,
      },
    }),
  ]);

  const successful = countFulfilled(results);

  // DB unique constraint: only 1 should succeed
  assert.strictEqual(successful, 1, "Only one PENDING invitation per company+email should be allowed");
});

test("concurrent invitation creates for same email — exactly one wins", async () => {
  const { company } = await createCompanyWithOwner();
  const email = "race@example.com";
  const expiresAt = new Date(Date.now() + 86400000);

  const results = await runConcurrently(
    () =>
      prisma.companyInvitation.create({
        data: {
          companyId: company.id,
          email,
          role: "RECRUITER",
          tokenHash: crypto.randomBytes(32).toString("hex"),
          encryptedToken: `token-${crypto.randomUUID()}`,
          expiresAt,
        },
      }),
    5
  );

  const successful = countFulfilled(results);
  assert.strictEqual(successful, 1, "Exactly 1 invitation should win under concurrency");
});

test("different emails can each have a pending invitation", async () => {
  const { company } = await createCompanyWithOwner();

  const results = await Promise.allSettled([
    createInvitation({ companyId: company.id, email: "user1@example.com" }),
    createInvitation({ companyId: company.id, email: "user2@example.com" }),
    createInvitation({ companyId: company.id, email: "user3@example.com" }),
  ]);

  const successful = countFulfilled(results);
  assert.strictEqual(successful, 3, "Different emails should each get their own invitation");
});

test("EXPIRED invitation allows new PENDING invitation for same email", async () => {
  const { company } = await createCompanyWithOwner();
  const email = "reinvite@example.com";

  // Create and expire first invitation
  const firstInvite = await createInvitation({ companyId: company.id, email });

  await prisma.companyInvitation.update({
    where: { id: firstInvite.id },
    data: { status: "EXPIRED", encryptedToken: "" },
  });

  // Now create a new PENDING invitation — should succeed
  const newInvite = await createInvitation({ companyId: company.id, email });
  assert.ok(newInvite.id);
  assert.strictEqual(newInvite.status, "PENDING");
});

test("ACCEPTED invitation allows new PENDING invitation for same email", async () => {
  const { company } = await createCompanyWithOwner();
  const email = "accepted@example.com";

  const firstInvite = await createInvitation({ companyId: company.id, email });

  await prisma.companyInvitation.update({
    where: { id: firstInvite.id },
    data: { status: "ACCEPTED", encryptedToken: "" },
  });

  const newInvite = await createInvitation({ companyId: company.id, email });
  assert.ok(newInvite.id);
});

// ─── Invitation Expiry Cleanup ────────────────────────────────────────────────

test("expirePendingInvitations marks expired invitations as EXPIRED", async () => {
  const { company } = await createCompanyWithOwner();

  // Create invitation that already expired
  const pastExpiry = new Date(Date.now() - 1000);
  const expiredInvite = await createInvitation({
    companyId: company.id,
    email: "expired@example.com",
    expiresAt: pastExpiry,
  });

  // Create invitation that is still valid
  const validInvite = await createInvitation({
    companyId: company.id,
    email: "valid@example.com",
    expiresAt: new Date(Date.now() + 86400000),
  });

  const { expirePendingInvitations } = require("../../src/modules/company/company.invitation.service");
  const count = await expirePendingInvitations();

  assert.ok(count >= 1, "At least one invitation should be expired");

  const reloaded = await prisma.companyInvitation.findUnique({
    where: { id: expiredInvite.id },
  });
  assert.strictEqual(reloaded.status, "EXPIRED");
  assert.strictEqual(reloaded.encryptedToken, "");

  const validReloaded = await prisma.companyInvitation.findUnique({
    where: { id: validInvite.id },
  });
  assert.strictEqual(validReloaded.status, "PENDING");
});
