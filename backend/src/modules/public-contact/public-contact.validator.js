"use strict";

const { z } = require("zod");
const { PUBLIC_CONTACT_LIMITS, PUBLIC_CONTACT_STATUS } = require("./public-contact.constants");

const createPublicContactSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(PUBLIC_CONTACT_LIMITS.FULL_NAME.MIN, "Full name must be at least 2 characters")
    .max(PUBLIC_CONTACT_LIMITS.FULL_NAME.MAX, "Full name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(PUBLIC_CONTACT_LIMITS.EMAIL.MAX, "Email must not exceed 150 characters"),
  subject: z
    .string()
    .trim()
    .min(PUBLIC_CONTACT_LIMITS.SUBJECT.MIN, "Subject must be at least 3 characters")
    .max(PUBLIC_CONTACT_LIMITS.SUBJECT.MAX, "Subject must not exceed 200 characters"),
  message: z
    .string()
    .trim()
    .min(PUBLIC_CONTACT_LIMITS.MESSAGE.MIN, "Message must be at least 10 characters")
    .max(PUBLIC_CONTACT_LIMITS.MESSAGE.MAX, "Message must not exceed 5000 characters"),
});

const getPublicContactsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(PUBLIC_CONTACT_STATUS).optional(),
  sortField: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const updatePublicContactStatusSchema = z.object({
  status: z.nativeEnum(PUBLIC_CONTACT_STATUS),
});

const replyPublicContactSchema = z.object({
  reply: z
    .string()
    .trim()
    .min(PUBLIC_CONTACT_LIMITS.ADMIN_REPLY.MIN, "Reply must be at least 5 characters")
    .max(PUBLIC_CONTACT_LIMITS.ADMIN_REPLY.MAX, "Reply must not exceed 5000 characters"),
});

module.exports = {
  createPublicContactSchema,
  getPublicContactsAdminQuerySchema,
  updatePublicContactStatusSchema,
  replyPublicContactSchema,
};
