const test = require("node:test");
const assert = require("node:assert");
const { toUserResponse } = require("../../src/modules/auth/auth.mapper");

test("Auth Mapper & Data Sanitation Suite", async (t) => {
  await t.test("Sanitizes user profile response by omitting password and sensitive tokens", () => {
    const rawUser = {
      id: "usr_123456789",
      email: "hr.lead@hirequest.com",
      password: "hashed_secret_password_bytes",
      firstName: "Admin",
      lastName: "User",
      role: "HR",
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date(),
    };

    const sanitized = toUserResponse(rawUser);

    assert.strictEqual(sanitized.id, "usr_123456789");
    assert.strictEqual(sanitized.email, "hr.lead@hirequest.com");
    assert.strictEqual(sanitized.password, undefined);
    assert.strictEqual(sanitized.tokenVersion, undefined);
  });
});
