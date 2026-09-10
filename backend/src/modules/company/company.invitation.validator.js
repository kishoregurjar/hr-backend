"use strict";

const { z } = require("zod");

const createCompanyInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),

  role: z.enum([
    "ADMIN",
    "RECRUITER",
  ]),
});

const acceptCompanyInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1),
});

const acceptAndRegisterCompanyInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required."),
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  password: z.string().trim().min(8, "Password must be at least 8 characters."),
});

const listCompanyInvitationsSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  status: z
    .enum([
      "PENDING",
      "ACCEPTED",
      "EXPIRED",
      "REVOKED",
    ])
    .optional(),
});

module.exports = {
  createCompanyInvitationSchema,
  acceptCompanyInvitationSchema,
  acceptAndRegisterCompanyInvitationSchema,
  listCompanyInvitationsSchema,
};
