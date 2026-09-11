"use strict";

const { z } = require("zod");
const { COMPANY_CONSTANTS } = require("./company.constants");

const mapCompanyAliases = (data) => {
  const website = data.website || data.websiteUrl;
  const email = data.email || data.officialEmail;
  const description = data.description || data.about;

  const result = { ...data };
  delete result.websiteUrl;
  delete result.officialEmail;
  delete result.about;

  if (website !== undefined) result.website = website;
  if (email !== undefined) result.email = email;
  if (description !== undefined) result.description = description;

  return result;
};

const emptyToNull = (schema) =>
  z.preprocess((val) => (typeof val === "string" && val.trim() === "" ? null : val), schema);

const companyBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(COMPANY_CONSTANTS.NAME.MIN_LENGTH)
    .max(COMPANY_CONSTANTS.NAME.MAX_LENGTH),

  website: emptyToNull(
    z
      .string()
      .trim()
      .url()
      .max(COMPANY_CONSTANTS.WEBSITE.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  websiteUrl: emptyToNull(
    z
      .string()
      .trim()
      .url()
      .max(COMPANY_CONSTANTS.WEBSITE.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  industry: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.INDUSTRY.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  description: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.DESCRIPTION.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  about: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.DESCRIPTION.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  email: emptyToNull(
    z
      .string()
      .trim()
      .email()
      .optional()
      .nullable()
  ),

  officialEmail: emptyToNull(
    z
      .string()
      .trim()
      .email()
      .optional()
      .nullable()
  ),

  phone: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.PHONE.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  address: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.ADDRESS.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  city: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.CITY.MAX_LENGTH)
      .optional()
      .nullable()
  ),

  country: emptyToNull(
    z
      .string()
      .trim()
      .max(COMPANY_CONSTANTS.COUNTRY.MAX_LENGTH)
      .optional()
      .nullable()
  ),
});

const createCompanySchema = companyBaseSchema.transform(mapCompanyAliases);

const updateCompanySchema = companyBaseSchema.partial().transform(mapCompanyAliases);

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

const memberIdParamSchema = z.object({
  memberId: z.string().trim().min(1),
});

const transferOwnershipSchema = z.object({
  targetMemberId: z.string().trim().min(1).optional(),
  memberId: z.string().trim().min(1).optional(),
}).transform((data) => ({
  targetMemberId: data.targetMemberId || data.memberId,
})).refine((data) => Boolean(data.targetMemberId), {
  message: "targetMemberId is required",
});

const transferCompanyOwnershipSchema = transferOwnershipSchema;

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
  updateMemberRoleSchema,
  memberIdParamSchema,
  transferOwnershipSchema,
  transferCompanyOwnershipSchema,
  deleteCompanySchema,
};



