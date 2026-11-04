"use strict";

const { z } = require("zod");
const { COMPANY_CONSTANTS } = require("./company.constants");

/**
 * Transforms a company entity into a public-safe white-label branding DTO.
 * Guarantees zero leakage of internal company data, credentials, storage paths,
 * or member information.
 *
 * @param {Object|null} company - Company entity from database
 * @returns {Object} Standardized public branding DTO
 */
const toPublicBrandingDTO = (company) => {
  if (!company) {
    return {
      companyName: null,
      logoUrl: null,
      brandColor: null,
      accentColor: null,
      faviconUrl: null,
      brandTagline: null,
      showPoweredByHireQuest: true,
    };
  }

  return {
    companyName: company.name ?? null,
    logoUrl: company.logoUrl ?? null,
    brandColor: company.brandColor ?? null,
    accentColor: company.accentColor ?? null,
    faviconUrl: company.faviconUrl ?? null,
    brandTagline: company.brandTagline ?? null,
    showPoweredByHireQuest: company.showPoweredByHireQuest !== false,
  };
};

/**
 * Helper to convert empty string inputs into null
 */
const emptyToNull = (schema) =>
  z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    schema
  );

/**
 * Validates a safe HTTP/HTTPS URL and rejects javascript:, data:, and other unsafe protocols
 */
const safeHttpUrlSchema = z
  .string()
  .trim()
  .max(2048, "URL is too long")
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must be a valid HTTP or HTTPS address" }
  );

/**
 * Strict HEX color validator matching #RGB or #RRGGBB
 */
const hexColorSchema = z
  .string()
  .trim()
  .regex(
    COMPANY_CONSTANTS.BRANDING.HEX_COLOR_REGEX,
    "Invalid HEX color format. Must be a valid 3-character or 6-character hex code starting with #"
  );

/**
 * Strict validation schema for updating company branding.
 * Prevents arbitrary field updates (strict) and sanitizes colors, taglines, and URLs.
 */
const updateBrandingSchema = z
  .object({
    brandColor: emptyToNull(hexColorSchema.optional().nullable()),
    accentColor: emptyToNull(hexColorSchema.optional().nullable()),
    brandTagline: emptyToNull(
      z
        .string()
        .trim()
        .max(
          COMPANY_CONSTANTS.BRANDING.TAGLINE.MAX_LENGTH,
          `Tagline cannot exceed ${COMPANY_CONSTANTS.BRANDING.TAGLINE.MAX_LENGTH} characters`
        )
        .optional()
        .nullable()
    ),
    showPoweredByHireQuest: z.boolean().optional(),
    faviconUrl: emptyToNull(safeHttpUrlSchema.optional().nullable()),
    logoUrl: emptyToNull(safeHttpUrlSchema.optional().nullable()),
  })
  .strict();

module.exports = {
  toPublicBrandingDTO,
  updateBrandingSchema,
  safeHttpUrlSchema,
  hexColorSchema,
};

