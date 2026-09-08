"use strict";

const { z } = require("zod");
const { COMPANY_CONSTANTS } = require("./company.constants");

const createCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(COMPANY_CONSTANTS.NAME.MIN_LENGTH)
    .max(COMPANY_CONSTANTS.NAME.MAX_LENGTH),

  website: z
    .string()
    .trim()
    .url()
    .max(COMPANY_CONSTANTS.WEBSITE.MAX_LENGTH)
    .optional()
    .nullable(),

  industry: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.INDUSTRY.MAX_LENGTH)
    .optional()
    .nullable(),

  description: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.DESCRIPTION.MAX_LENGTH)
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable(),

  phone: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.PHONE.MAX_LENGTH)
    .optional()
    .nullable(),

  address: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.ADDRESS.MAX_LENGTH)
    .optional()
    .nullable(),

  city: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.CITY.MAX_LENGTH)
    .optional()
    .nullable(),

  country: z
    .string()
    .trim()
    .max(COMPANY_CONSTANTS.COUNTRY.MAX_LENGTH)
    .optional()
    .nullable(),
});

const updateCompanySchema = createCompanySchema.partial();

const inviteCompanyMemberSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1),

  role: z.enum([
    "ADMIN",
    "RECRUITER",
  ]),
});

const updateCompanyMemberRoleSchema = z.object({
  role: z.enum([
    "ADMIN",
    "RECRUITER",
  ]),
});

const updateMemberRoleSchema = updateCompanyMemberRoleSchema;

const transferCompanyOwnershipSchema = z.object({
  memberId: z.string().trim().min(1),
});

const deleteCompanySchema = z.object({
  confirmation: z
    .string()
    .trim()
    .min(1)
    .max(COMPANY_CONSTANTS.NAME.MAX_LENGTH),
});

module.exports = {
  createCompanySchema,
  updateCompanySchema,
  inviteCompanyMemberSchema,
  updateCompanyMemberRoleSchema,
  transferCompanyOwnershipSchema,
  updateMemberRoleSchema,
  deleteCompanySchema,
};



