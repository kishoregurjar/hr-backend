"use strict";

/**
 * Company Isolation Integration Tests
 * Verifies DB-level tenant isolation and suspended company blocking.
 *
 * Requires: real PostgreSQL test database
 * Run: node --test tests/company/company-isolation.test.js
 */

require("../helpers/test-env");

const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma, cleanDatabase, disconnectDatabase } = require("../helpers/test-db");
const {
  createCompanyWithOwner,
  createCompanyMember,
  createUser,
} = require("../helpers/test-factory");

const { resolveCompanyContext } = require("../../src/modules/company/company.context");

test.beforeEach(async () => {
  await cleanDatabase();
});

test.after(async () => {
  await disconnectDatabase();
});

// ─── Tenant Isolation ────────────────────────────────────────────────────────

test("user from company A has no membership in company B", async () => {
  const { company: companyA, owner: userA } = await createCompanyWithOwner({
    companyName: "Company A",
  });

  const { company: companyB } = await createCompanyWithOwner({
    companyName: "Company B",
  });

  // userA must NOT have membership in companyB
  const crossMembership = await prisma.companyMember.findFirst({
    where: {
      companyId: companyB.id,
      userId: userA.id,
    },
  });

  assert.strictEqual(crossMembership, null);
});

test("resolveCompanyContext grants access to own company member", async () => {
  const { company, owner } = await createCompanyWithOwner();

  const context = await resolveCompanyContext(owner.id, company.id);

  assert.ok(context.company);
  assert.ok(context.member);
  assert.strictEqual(context.member.userId, owner.id);
  assert.strictEqual(context.member.role, "OWNER");
});

test("resolveCompanyContext denies access for non-member", async () => {
  const { company } = await createCompanyWithOwner();
  const outsider = await createUser();

  await assert.rejects(
    () => resolveCompanyContext(outsider.id, company.id),
    (error) => {
      assert.strictEqual(error.statusCode, 403);
      return true;
    }
  );
});

test("resolveCompanyContext denies access for suspended company", async () => {
  const { company, owner } = await createCompanyWithOwner();

  await prisma.company.update({
    where: { id: company.id },
    data: { status: "SUSPENDED" },
  });

  await assert.rejects(
    () => resolveCompanyContext(owner.id, company.id),
    (error) => {
      assert.strictEqual(error.statusCode, 403);
      return true;
    }
  );
});

test("resolveCompanyContext requires companyId", async () => {
  const { owner } = await createCompanyWithOwner();

  await assert.rejects(
    () => resolveCompanyContext(owner.id, null),
    (error) => {
      // 400 = bad request (no company id provided)
      assert.ok(error.statusCode === 400 || error.statusCode === 403);
      return true;
    }
  );
});

test("user can be member of multiple companies independently", async () => {
  const { company: companyA } = await createCompanyWithOwner({ companyName: "Multi A" });
  const { company: companyB } = await createCompanyWithOwner({ companyName: "Multi B" });

  const sharedUser = await createUser();

  await createCompanyMember({ companyId: companyA.id, userId: sharedUser.id, role: "RECRUITER" });
  await createCompanyMember({ companyId: companyB.id, userId: sharedUser.id, role: "ADMIN" });

  const ctxA = await resolveCompanyContext(sharedUser.id, companyA.id);
  const ctxB = await resolveCompanyContext(sharedUser.id, companyB.id);

  assert.strictEqual(ctxA.member.role, "RECRUITER");
  assert.strictEqual(ctxB.member.role, "ADMIN");
});
