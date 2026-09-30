"use strict";

const { z } = require("zod");
const { SUPPORT_CONSTANTS } = require("./support.constants");

const createSupportRequestSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(SUPPORT_CONSTANTS.SUBJECT.MIN_LENGTH, "Subject must be at least 3 characters.")
    .max(SUPPORT_CONSTANTS.SUBJECT.MAX_LENGTH, "Subject must not exceed 200 characters."),

  message: z
    .string()
    .trim()
    .min(SUPPORT_CONSTANTS.MESSAGE.MIN_LENGTH, "Message must be at least 10 characters.")
    .max(SUPPORT_CONSTANTS.MESSAGE.MAX_LENGTH, "Message must not exceed 5000 characters."),
});

const listSupportRequestsSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(SUPPORT_CONSTANTS.PAGINATION.DEFAULT_PAGE),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SUPPORT_CONSTANTS.PAGINATION.MAX_LIMIT)
    .default(SUPPORT_CONSTANTS.PAGINATION.DEFAULT_LIMIT),

  status: z
    .enum([
      SUPPORT_CONSTANTS.STATUS.OPEN,
      SUPPORT_CONSTANTS.STATUS.IN_PROGRESS,
      SUPPORT_CONSTANTS.STATUS.RESOLVED,
    ])
    .optional(),

  sortBy: z
    .enum([
      SUPPORT_CONSTANTS.SORT_FIELDS.CREATED_AT,
      SUPPORT_CONSTANTS.SORT_FIELDS.UPDATED_AT,
      SUPPORT_CONSTANTS.SORT_FIELDS.STATUS,
    ])
    .default(SUPPORT_CONSTANTS.SORT_FIELDS.CREATED_AT),

  sortOrder: z
    .enum([
      SUPPORT_CONSTANTS.SORT_ORDERS.ASC,
      SUPPORT_CONSTANTS.SORT_ORDERS.DESC,
    ])
    .default(SUPPORT_CONSTANTS.SORT_ORDERS.DESC),
});

const supportRequestIdParamSchema = z.object({
  requestId: z.string().trim().min(1, "Request ID is required."),
});

const updateSupportStatusSchema = z.object({
  status: z.enum([
    SUPPORT_CONSTANTS.STATUS.OPEN,
    SUPPORT_CONSTANTS.STATUS.IN_PROGRESS,
    SUPPORT_CONSTANTS.STATUS.RESOLVED,
  ]),
});

const replySupportRequestSchema = z.object({
  reply: z
    .string()
    .trim()
    .min(SUPPORT_CONSTANTS.REPLY.MIN_LENGTH, "Reply must be at least 5 characters.")
    .max(SUPPORT_CONSTANTS.REPLY.MAX_LENGTH, "Reply must not exceed 5000 characters."),
});

module.exports = {
  createSupportRequestSchema,
  listSupportRequestsSchema,
  supportRequestIdParamSchema,
  updateSupportStatusSchema,
  replySupportRequestSchema,
};
