"use strict";

const { z } = require("zod");

const {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_RESUME_SIZE_BYTES,
} = require("./resume.constants");

const jobIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100);

const subjectCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100);

const inboundEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

const directUploadQuerySchema = z
  .object({
    jobId: jobIdSchema.optional(),
  })
  .strict();

const inboundResumeSchema = z
  .object({
    inboundEmail: inboundEmailSchema,
    subjectCode: subjectCodeSchema.optional(),
  })
  .strict();

function validateDirectUploadQuery(query) {
  return directUploadQuerySchema.parse(query || {});
}

function validateInboundResumePayload(payload) {
  return inboundResumeSchema.parse(payload || {});
}

const uploadResumeSchema = z
  .object({
    jobId: jobIdSchema.optional(),
  })
  .strict();

const manualReviewOverrideSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    lastName: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .optional(),

    phone: z
      .string()
      .trim()
      .min(5)
      .max(30)
      .optional(),

    skills: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
      )
      .max(100)
      .optional(),

    totalExperienceYears: z
      .number()
      .min(0)
      .max(70)
      .optional(),
  })
  .strict();

function validateResumeFile(file) {
  if (!file) {
    const error = new Error("RESUME_FILE_REQUIRED");
    error.statusCode = 400;
    error.code = "RESUME_FILE_REQUIRED";
    throw error;
  }

  if (!Number.isInteger(file.size) || file.size <= 0) {
    const error = new Error("RESUME_FILE_EMPTY");
    error.statusCode = 400;
    error.code = "RESUME_FILE_EMPTY";
    throw error;
  }

  if (file.size > MAX_RESUME_SIZE_BYTES) {
    const error = new Error("RESUME_FILE_TOO_LARGE");
    error.statusCode = 413;
    error.code = "RESUME_FILE_TOO_LARGE";
    throw error;
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error("RESUME_FILE_TYPE_NOT_ALLOWED");
    error.statusCode = 415;
    error.code = "RESUME_FILE_TYPE_NOT_ALLOWED";
    throw error;
  }

  const originalName = typeof file.originalname === "string" ? file.originalname : "";

  const extension = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
    : "";

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    const error = new Error("RESUME_FILE_EXTENSION_NOT_ALLOWED");
    error.statusCode = 415;
    error.code = "RESUME_FILE_EXTENSION_NOT_ALLOWED";
    throw error;
  }

  return true;
}

module.exports = {
  jobIdSchema,
  subjectCodeSchema,
  inboundEmailSchema,
  directUploadQuerySchema,
  inboundResumeSchema,
  validateDirectUploadQuery,
  validateInboundResumePayload,
  uploadResumeSchema,
  manualReviewOverrideSchema,
  validateResumeFile,
};
