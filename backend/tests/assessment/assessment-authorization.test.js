const test = require("node:test");
const assert = require("node:assert");
const { AUTH_ROLES } = require("../../src/modules/auth/auth.constants");

test("Assessment Authorization Matrix Suite", async (t) => {
  const allowedRoles = [AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR];

  await t.test("SUPER_ADMIN role is permitted for assessment management", () => {
    assert.strictEqual(allowedRoles.includes(AUTH_ROLES.SUPER_ADMIN), true);
  });

  await t.test("HR role is permitted for assessment management", () => {
    assert.strictEqual(allowedRoles.includes(AUTH_ROLES.HR), true);
  });

  await t.test("CANDIDATE role is denied for assessment management", () => {
    assert.strictEqual(allowedRoles.includes(AUTH_ROLES.CANDIDATE), false);
  });
});
