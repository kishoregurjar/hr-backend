const { z } = require("zod");
const { emailValidator: email, passwordValidator: password } = require("../../validators");

const name = z
  .string({ required_error: "Name is required." })
  .trim()
  .min(2, "Name must be at least 2 characters long.")
  .max(50, "Name cannot exceed 50 characters.");

/**
 * ==========================================================
 * Auth Module Zod Validation Schemas
 * ==========================================================
 * Uses centralized global validators for email & password rules.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

const registerSchema = z.object({
  body: z.object({
    firstName: name,
    lastName: name,
    email,
    password,
    role: z.enum(["SUPER_ADMIN", "HR", "CANDIDATE"]).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string({ required_error: "Password is required." }).min(1, "Password is required."),
  }),
});

const refreshTokenSchema = z.object({
  cookies: z
    .object({
      refreshToken: z.string().optional(),
    })
    .optional(),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email,
  }),
});

const resetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string({ required_error: "Reset token is required." }).min(20, "Invalid reset token."),
      password: password.optional(),
      newPassword: password.optional(),
    })
    .refine((data) => Boolean(data.password || data.newPassword), {
      message: "Password is required.",
      path: ["newPassword"],
    }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string({ required_error: "Current password is required." }).min(1, "Current password is required."),
    newPassword: password,
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
