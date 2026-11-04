"use strict";

const { z } = require("zod");
const { SUPER_ADMIN_COMPANY_CONSTANTS } = require("./super-admin.company.constants");
const { normalizeDomainString } = require("../../utils/tenant-url");

const RESERVED_DOMAINS = [
  "hirequest.com",
  "app.hirequest.com",
  "admin.hirequest.com",
  "api.hirequest.com",
  "staging.hirequest.com",
  "localhost",
  "127.0.0.1",
];

const createSuperAdminCompanySchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(SUPER_ADMIN_COMPANY_CONSTANTS.NAME.MIN_LENGTH)
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.NAME.MAX_LENGTH),

    ownerName: z
      .preprocess(
        (val) => (!val || (typeof val === "string" && !val.trim()) ? null : val.trim()),
        z
          .string()
          .min(SUPER_ADMIN_COMPANY_CONSTANTS.OWNER_NAME.MIN_LENGTH)
          .max(SUPER_ADMIN_COMPANY_CONSTANTS.OWNER_NAME.MAX_LENGTH)
          .nullable()
          .optional()
      ),

    ownerEmail: z
      .string()
      .trim()
      .email()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.OWNER_EMAIL.MAX_LENGTH)
      .transform((value) => value.toLowerCase()),

    domainMode: z
      .enum(["SUBDOMAIN", "CUSTOM_DOMAIN"])
      .default("SUBDOMAIN")
      .optional(),

    website: z
      .preprocess(
        (val) => (!val || (typeof val === "string" && !val.trim()) ? null : val.trim()),
        z
          .string()
          .url()
          .max(SUPER_ADMIN_COMPANY_CONSTANTS.WEBSITE.MAX_LENGTH)
          .nullable()
          .optional()
      ),

    domain: z
      .preprocess(
        (val) => (!val || (typeof val === "string" && !val.trim()) ? null : normalizeDomainString(val)),
        z.string().max(255).nullable().optional()
      ),

    customDomain: z
      .preprocess(
        (val) => (!val || (typeof val === "string" && !val.trim()) ? null : normalizeDomainString(val)),
        z.string().max(255).nullable().optional()
      ),

    industry: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.INDUSTRY.MAX_LENGTH)
      .optional()
      .nullable(),

    description: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.DESCRIPTION.MAX_LENGTH)
      .optional()
      .nullable(),

    phone: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.PHONE.MAX_LENGTH)
      .optional()
      .nullable(),

    address: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.ADDRESS.MAX_LENGTH)
      .optional()
      .nullable(),

    city: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.CITY.MAX_LENGTH)
      .optional()
      .nullable(),

    country: z
      .string()
      .trim()
      .max(SUPER_ADMIN_COMPANY_CONSTANTS.COUNTRY.MAX_LENGTH)
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.domainMode === "CUSTOM_DOMAIN") {
      const candidateDomain = data.customDomain || data.domain;
      if (!candidateDomain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customDomain"],
          message: "Custom domain is required when Domain Mode is set to Custom Domain.",
        });
        return;
      }

      const domainLower = candidateDomain.toLowerCase();
      if (!domainLower.includes(".") || domainLower.startsWith(".") || domainLower.endsWith(".")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customDomain"],
          message: "Please enter a valid fully-qualified domain name (e.g. company.com).",
        });
        return;
      }

      if (RESERVED_DOMAINS.includes(domainLower) || domainLower.endsWith(".hirequest.com")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customDomain"],
          message: "This domain name is reserved and cannot be assigned as a custom domain.",
        });
      }
    }
  });

const listCompaniesSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(SUPER_ADMIN_COMPANY_CONSTANTS.PAGINATION.DEFAULT_PAGE),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SUPER_ADMIN_COMPANY_CONSTANTS.PAGINATION.MAX_LIMIT)
    .default(SUPER_ADMIN_COMPANY_CONSTANTS.PAGINATION.DEFAULT_LIMIT),

  search: z.string().trim().min(1).max(100).optional(),

  status: z
    .enum([
      SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.ACTIVE,
      SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.SUSPENDED,
    ])
    .optional(),

  sortBy: z
    .enum([
      SUPER_ADMIN_COMPANY_CONSTANTS.SORT_FIELDS.CREATED_AT,
      SUPER_ADMIN_COMPANY_CONSTANTS.SORT_FIELDS.UPDATED_AT,
      SUPER_ADMIN_COMPANY_CONSTANTS.SORT_FIELDS.NAME,
    ])
    .default(SUPER_ADMIN_COMPANY_CONSTANTS.SORT_FIELDS.CREATED_AT),

  sortOrder: z
    .enum([
      SUPER_ADMIN_COMPANY_CONSTANTS.SORT_ORDERS.ASC,
      SUPER_ADMIN_COMPANY_CONSTANTS.SORT_ORDERS.DESC,
    ])
    .default(SUPER_ADMIN_COMPANY_CONSTANTS.SORT_ORDERS.DESC),
});

const companyIdParamSchema = z.object({
  companyId: z.string().trim().min(1),
});

const updateCompanyStatusSchema = z.object({
  status: z.enum([
    SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.ACTIVE,
    SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.SUSPENDED,
  ]),
});

module.exports = {
  createSuperAdminCompanySchema,
  listCompaniesSchema,
  companyIdParamSchema,
  updateCompanyStatusSchema,
};
