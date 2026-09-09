"use strict";

/**
 * RBAC Matrix Tests
 * No DB required — pure unit tests on permission constants.
 * Run: node --test tests/company/company-authorization.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COMPANY_PERMISSIONS,
  hasPermission,
  assertPermission,
} = require("../../src/modules/company/company.authorization");

test("OWNER has every defined permission", () => {
  for (const permission of Object.values(COMPANY_PERMISSIONS)) {
    assert.strictEqual(
      hasPermission("OWNER", permission),
      true,
      `OWNER must have permission: ${permission}`
    );
  }
});

test("ADMIN cannot transfer ownership", () => {
  assert.strictEqual(
    hasPermission("ADMIN", COMPANY_PERMISSIONS.TRANSFER_OWNERSHIP),
    false
  );
});

test("ADMIN cannot delete company", () => {
  assert.strictEqual(
    hasPermission("ADMIN", COMPANY_PERMISSIONS.DELETE_COMPANY),
    false
  );
});

test("ADMIN can invite members", () => {
  assert.strictEqual(
    hasPermission("ADMIN", COMPANY_PERMISSIONS.INVITE_MEMBER),
    true
  );
});

test("RECRUITER cannot update company", () => {
  assert.strictEqual(
    hasPermission("RECRUITER", COMPANY_PERMISSIONS.UPDATE_COMPANY),
    false
  );
});

test("RECRUITER cannot invite members", () => {
  assert.strictEqual(
    hasPermission("RECRUITER", COMPANY_PERMISSIONS.INVITE_MEMBER),
    false
  );
});

test("RECRUITER cannot remove members", () => {
  assert.strictEqual(
    hasPermission("RECRUITER", COMPANY_PERMISSIONS.REMOVE_MEMBER),
    false
  );
});

test("RECRUITER can view company", () => {
  assert.strictEqual(
    hasPermission("RECRUITER", COMPANY_PERMISSIONS.VIEW_COMPANY),
    true
  );
});

test("assertPermission throws 403 for unauthorized role", () => {
  assert.throws(
    () => assertPermission("RECRUITER", COMPANY_PERMISSIONS.DELETE_COMPANY),
    (error) => {
      assert.strictEqual(error.statusCode, 403);
      return true;
    }
  );
});

test("assertPermission returns true for authorized role", () => {
  const result = assertPermission("OWNER", COMPANY_PERMISSIONS.DELETE_COMPANY);
  assert.strictEqual(result, true);
});

test("invalid role has no permissions", () => {
  assert.strictEqual(hasPermission("SUPERUSER", COMPANY_PERMISSIONS.VIEW_COMPANY), false);
  assert.strictEqual(hasPermission("", COMPANY_PERMISSIONS.VIEW_COMPANY), false);
  assert.strictEqual(hasPermission(null, COMPANY_PERMISSIONS.VIEW_COMPANY), false);
});
