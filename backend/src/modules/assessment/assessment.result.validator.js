"use strict";

const { z } = require("zod");
const { ASSESSMENT_RESULT_CONSTANTS } = require("./assessment.result.constants");

const sortFields = ASSESSMENT_RESULT_CONSTANTS.SORT.ALLOWED_FIELDS;
const resultStatuses = Object.values(ASSESSMENT_RESULT_CONSTANTS.STATUS);

const resultQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(ASSESSMENT_RESULT_CONSTANTS.PAGINATION.MAX_LIMIT)
      .default(20),

    status: z.enum(resultStatuses).optional(),

    sortBy: z.enum(sortFields).default("createdAt"),

    sortOrder: z.enum(["asc", "desc"]).default("desc"),

    search: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();

const assessmentIdParamsSchema = z
  .object({
    assessmentId: z
      .string()
      .trim()
      .min(1)
      .max(100),
  })
  .strict();

const candidateAssessmentParamsSchema = z
  .object({
    candidateAssessmentId: z
      .string()
      .trim()
      .min(1)
      .max(100),
  })
  .strict();

function validateResultQuery(query) {
  return resultQuerySchema.parse(query);
}

function validateAssessmentIdParams(params) {
  return assessmentIdParamsSchema.parse(params);
}

function validateCandidateAssessmentParams(params) {
  return candidateAssessmentParamsSchema.parse(params);
}

module.exports = {
  resultQuerySchema,
  assessmentIdParamsSchema,
  candidateAssessmentParamsSchema,
  validateResultQuery,
  validateAssessmentIdParams,
  validateCandidateAssessmentParams,
};
