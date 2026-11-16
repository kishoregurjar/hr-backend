"use strict";

const { z } = require("zod");
const { DISPOSABLE_EMAIL_DOMAINS, FREE_EMAIL_DOMAINS } = require("./trial-application.constants");

/**
 * Extracts and lowercases the domain portion of an email.
 */
const getEmailDomain = (email) => {
  if (typeof email !== "string") return "";
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
};

/**
 * Checks if the domain is a temporary/disposable email service
 */
const isDisposableEmail = (email) => {
  const domain = getEmailDomain(email);
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
};

/**
 * Checks if the email is a business domain (not consumer/free email)
 */
const isBusinessDomain = (email) => {
  const domain = getEmailDomain(email);
  return domain.length > 0 && !FREE_EMAIL_DOMAINS.has(domain) && !DISPOSABLE_EMAIL_DOMAINS.has(domain);
};

const sendOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .email("A valid business email address is required.")
    .refine((val) => !isDisposableEmail(val), {
      message: "Temporary or disposable email domains are not permitted. Please use a valid business email.",
    }),
});

const applyTrialSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters.")
    .max(100, "Company name cannot exceed 100 characters."),
  ownerName: z
    .string()
    .trim()
    .min(2, "Owner full name must be at least 2 characters.")
    .max(100, "Owner name cannot exceed 100 characters."),
  businessEmail: z
    .string()
    .trim()
    .email("A valid email address is required.")
    .refine((val) => !isDisposableEmail(val), {
      message: "Temporary or disposable email domains are not permitted.",
    }),
  otp: z
    .string()
    .trim()
    .length(6, "Verification OTP must be exactly 6 digits.")
    .regex(/^\d{6}$/, "Verification OTP must contain digits only."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long.")
    .max(128, "Password cannot exceed 128 characters."),
  confirmPassword: z.string().optional(),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number cannot exceed 30 characters.")
    .optional()
    .nullable(),
  website: z
    .string()
    .trim()
    .max(255, "Website URL cannot exceed 255 characters.")
    .optional()
    .nullable(),
  businessDescription: z
    .string()
    .trim()
    .max(1000, "Business description cannot exceed 1000 characters.")
    .optional()
    .nullable(),
  industry: z
    .string()
    .trim()
    .max(100, "Industry cannot exceed 100 characters.")
    .optional()
    .nullable(),
});

module.exports = {
  getEmailDomain,
  isDisposableEmail,
  isBusinessDomain,
  sendOtpSchema,
  applyTrialSchema,
};

