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
  listCompanyInvitationsSchema,
};
