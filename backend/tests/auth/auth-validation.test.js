const test = require("node:test");
const assert = require("node:assert");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
} = require("../../src/modules/auth/auth.validator");

test("Auth Validation Suite", async (t) => {
  await t.test("Valid registration payload passes validation", () => {
    const validPayload = {
      body: {
        email: "hr.manager@hirequest.com",
        password: "Password123!",
        firstName: "Kishore",
        lastName: "Gurjar",
        role: "HR",
      },
    };

    const parsed = registerSchema.parse(validPayload);
    assert.strictEqual(parsed.body.email, "hr.manager@hirequest.com");
    assert.strictEqual(parsed.body.firstName, "Kishore");
  });

  await t.test("Rejects invalid email format in login", () => {
    const invalidPayload = {
      body: {
        email: "invalid-email-string",
        password: "Password123!",
      },
    };

    assert.throws(() => {
      loginSchema.parse(invalidPayload);
    });
  });

  await t.test("Rejects weak short passwords in registration", () => {
    const invalidPayload = {
      body: {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "123",
      },
    };

    assert.throws(() => {
      registerSchema.parse(invalidPayload);
    });
  });

  await t.test("Forgot password accepts valid email", () => {
    const payload = {
      body: {
        email: "developer@hirequest.io",
      },
    };

    const parsed = forgotPasswordSchema.parse(payload);
    assert.strictEqual(parsed.body.email, "developer@hirequest.io");
  });
});
