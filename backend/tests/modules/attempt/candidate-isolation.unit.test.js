"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const attemptService = require("../../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../../src/modules/attempt/attempt.repository");
const { prisma } = require("../../../src/config/prisma");

test("Candidate Isolation Tests for AttemptService", async (t) => {
  let originalCompanyMember;
  let originalList;
  let originalCount;
  let originalListAttempts;
  let originalCountAttempts;

  t.beforeEach(() => {
    originalCompanyMember = prisma.companyMember;
    originalList = attemptRepository.listCandidatesForHR;
    originalCount = attemptRepository.countCandidatesForHR;
    originalListAttempts = attemptRepository.listAttemptsForHR;
    originalCountAttempts = attemptRepository.countAttemptsForHR;

    prisma.companyMember = {
      findFirst: async ({ where }) => {
        if (where.userId === "user-hr-1") return { companyId: "company-1" };
        return null;
      },
    };
    attemptRepository.listCandidatesForHR = async () => [];
    attemptRepository.countCandidatesForHR = async () => 0;
    attemptRepository.listAttemptsForHR = async () => [];
    attemptRepository.countAttemptsForHR = async () => 0;
  });

  t.afterEach(() => {
    prisma.companyMember = originalCompanyMember;
    attemptRepository.listCandidatesForHR = originalList;
    attemptRepository.countCandidatesForHR = originalCount;
    attemptRepository.listAttemptsForHR = originalListAttempts;
    attemptRepository.countAttemptsForHR = originalCountAttempts;
  });

  await t.test("getCandidates successfully accesses own company candidates", async () => {
    const user = { id: "user-hr-1", role: "HR" };
    const result = await attemptService.getCandidates({ user, companyId: "company-1" });
    assert.deepEqual(result.items, []);
  });

  await t.test("getCandidates throws ForbiddenError when HR tries to access another company", async () => {
    const user = { id: "user-hr-1", role: "HR" };
    try {
      await attemptService.getCandidates({ user, companyId: "company-2" });
      assert.fail("Should have thrown ForbiddenError");
    } catch (err) {
      assert.strictEqual(err.name, "ForbiddenError");
      assert.strictEqual(err.message, "You do not have permission to access candidates for this company.");
    }
  });

  await t.test("getCandidates allows SUPER_ADMIN to access any company", async () => {
    const user = { id: "user-admin", role: "SUPER_ADMIN" };
    const result = await attemptService.getCandidates({ user, companyId: "company-2" });
    assert.deepEqual(result.items, []);
  });
});
