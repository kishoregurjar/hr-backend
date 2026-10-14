"use strict";

const { z } = require("zod");
const {
  SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS,
} = require("./super-admin.owner-activation.constants");

const activateOwnerSchema = z.object({
  token: z.string().trim().min(1, "Activation token is required"),
  password: z
    .string({ required_error: "Password is required" })
    .min(
      SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MIN_LENGTH,
      `Password must be at least ${SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MIN_LENGTH} characters`
    )
    .max(
      SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MAX_LENGTH,
      `Password cannot exceed ${SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MAX_LENGTH} characters`
    )
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter (A-Z)")
    .regex(/[0-9]/, "Password must contain at least one number (0-9)")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special symbol"),
});

module.exports = {
  activateOwnerSchema,
};
