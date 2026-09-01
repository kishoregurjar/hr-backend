const test = require("node:test");
const assert = require("node:assert");
const { AUTH_ROLES } = require("../../src/modules/auth/auth.constants");

test("Auth Roles Matrix Suite", async (t) => {
  await t.test("Defines SUPER_ADMIN, HR, and CANDIDATE roles correctly", () => {
    assert.strictEqual(AUTH_ROLES.SUPER_ADMIN, "SUPER_ADMIN");
    assert.strictEqual(AUTH_ROLES.HR, "HR");
    assert.strictEqual(AUTH_ROLES.CANDIDATE, "CANDIDATE");
  });
});
