"use strict";

const { z } = require("zod");
const { SUPER_ADMIN_USER_CONSTANTS } = require("./super-admin.user.constants");

const listUsersSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(SUPER_ADMIN_USER_CONSTANTS.PAGINATION.DEFAULT_PAGE),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SUPER_ADMIN_USER_CONSTANTS.PAGINATION.MAX_LIMIT)
    .default(SUPER_ADMIN_USER_CONSTANTS.PAGINATION.DEFAULT_LIMIT),

  search: z
    .string()
    .trim()
    .min(1)
    .max(SUPER_ADMIN_USER_CONSTANTS.SEARCH.MAX_LENGTH)
    .optional(),

  role: z
    .enum([
      SUPER_ADMIN_USER_CONSTANTS.ROLES.SUPER_ADMIN,
      SUPER_ADMIN_USER_CONSTANTS.ROLES.HR,
    ])
    .optional(),

  status: z
    .enum([
      SUPER_ADMIN_USER_CONSTANTS.STATUS.INVITED,
      SUPER_ADMIN_USER_CONSTANTS.STATUS.ACTIVE,
      SUPER_ADMIN_USER_CONSTANTS.STATUS.SUSPENDED,
      SUPER_ADMIN_USER_CONSTANTS.STATUS.DEACTIVATED,
    ])
    .optional(),

  sortBy: z
    .enum([
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.CREATED_AT,
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.UPDATED_AT,
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.NAME,
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.EMAIL,
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.ROLE,
      SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.STATUS,
    ])
    .default(SUPER_ADMIN_USER_CONSTANTS.SORT_FIELDS.CREATED_AT),

  sortOrder: z
    .enum([
      SUPER_ADMIN_USER_CONSTANTS.SORT_ORDERS.ASC,
      SUPER_ADMIN_USER_CONSTANTS.SORT_ORDERS.DESC,
    ])
    .default(SUPER_ADMIN_USER_CONSTANTS.SORT_ORDERS.DESC),
});

const invitePlatformAdminSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SUPER_ADMIN_USER_CONSTANTS.NAME.MIN_LENGTH)
    .max(SUPER_ADMIN_USER_CONSTANTS.NAME.MAX_LENGTH),

  email: z
    .string()
    .trim()
    .email()
    .max(SUPER_ADMIN_USER_CONSTANTS.EMAIL.MAX_LENGTH)
    .transform((value) => value.toLowerCase()),
});

const userIdParamSchema = z.object({
  userId: z.string().trim().min(1),
});

const updateUserRoleSchema = z.object({
  role: z.enum([
    SUPER_ADMIN_USER_CONSTANTS.ROLES.SUPER_ADMIN,
    SUPER_ADMIN_USER_CONSTANTS.ROLES.HR,
  ]),
});

const updateUserStatusSchema = z.object({
  status: z.enum([
    SUPER_ADMIN_USER_CONSTANTS.STATUS.INVITED,
    SUPER_ADMIN_USER_CONSTANTS.STATUS.ACTIVE,
    SUPER_ADMIN_USER_CONSTANTS.STATUS.SUSPENDED,
    SUPER_ADMIN_USER_CONSTANTS.STATUS.DEACTIVATED,
  ]),
});

module.exports = {
  listUsersSchema,
  invitePlatformAdminSchema,
  userIdParamSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
};
