"use strict";

const { z } = require("zod");
const { ASSESSMENT_ANALYTICS_CONSTANTS } = require("./assessment.analytics.constants");

const assessmentIdParamsSchema = z
  .object({
    assessmentId: z.string().trim().min(1).max(100),
  })
  .strict();

const analyticsQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.DEFAULT_PAGE),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.MAX_LIMIT)
      .default(ASSESSMENT_ANALYTICS_CONSTANTS.PAGINATION.DEFAULT_LIMIT),

    sortBy: z
      .enum(ASSESSMENT_ANALYTICS_CONSTANTS.SORT.ALLOWED_FIELDS)
      .default(ASSESSMENT_ANALYTICS_CONSTANTS.SORT.DEFAULT_BY),

    sortOrder: z
      .enum(["asc", "desc"])
      .default(ASSESSMENT_ANALYTICS_CONSTANTS.SORT.DEFAULT_ORDER),

    search: z.string().trim().max(200).optional(),
  })
  .strict();

function validateAssessmentIdParams(params) {
  return assessmentIdParamsSchema.parse(params);
}

function validateAnalyticsQuery(query) {
  return analyticsQuerySchema.parse(query);
}

module.exports = {
  assessmentIdParamsSchema,
  analyticsQuerySchema,
  validateAssessmentIdParams,
  validateAnalyticsQuery,
};
