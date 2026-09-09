"use strict";

const { z } = require("zod");
const {
  SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS,
} = require("./super-admin.owner-activation.constants");

const activateOwnerSchema = z.object({
  token: z.string().trim().min(1, "Activation token is required"),
  password: z
    .string()
    .min(
      SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MIN_LENGTH,
      `Password must be at least ${SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MIN_LENGTH} characters`
    )
    .max(
      SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MAX_LENGTH,
      `Password cannot exceed ${SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.PASSWORD.MAX_LENGTH} characters`
    ),
});

module.exports = {
  activateOwnerSchema,
};
