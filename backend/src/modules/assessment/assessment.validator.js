const { z } = require("zod");
const {
  ASSESSMENT_DIFFICULTY,
  ASSESSMENT_LIMITS,
  ASSESSMENT_TYPE,
  ASSESSMENT_STATUS,
  ASSESSMENT_SORT_FIELDS,
  ASSESSMENT_SORT_ORDER,
  ASSESSMENT_PAGINATION,
} = require("./assessment.constants");

/**
 * ==========================================================
 * String Preprocessing Helpers
 * ==========================================================
 */
const requiredTrimmedString = (fieldName, min, max) =>
  z
    .string({
      required_error: `${fieldName} is required.`,
      invalid_type_error: `${fieldName} must be a string.`,
    })
    .trim()
    .min(min, `${fieldName} must be at least ${min} characters.`)
    .max(max, `${fieldName} cannot exceed ${max} characters.`);

const optionalTrimmedString = (max) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return value;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.string().max(max, `Value cannot exceed ${max} characters.`).nullable().optional()
  );

/**
 * ==========================================================
 * 1. Create Assessment Schema (Frontend Resilient)
 * ==========================================================
 */
const preprocessEnumFilter = (val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
      return undefined;
    }
    return trimmed.toUpperCase();
  }
  return val;
};

const createAssessmentBodySchema = z
  .object({
    title: requiredTrimmedString(
      "Assessment title",
      ASSESSMENT_LIMITS.TITLE_MIN_LENGTH,
      ASSESSMENT_LIMITS.TITLE_MAX_LENGTH
    ),
    description: optionalTrimmedString(ASSESSMENT_LIMITS.DESCRIPTION_MAX_LENGTH),
    instructions: optionalTrimmedString(ASSESSMENT_LIMITS.INSTRUCTIONS_MAX_LENGTH),
    durationMinutes: z.coerce
      .number({ invalid_type_error: "Duration must be a valid number." })
      .int("Duration must be a whole number.")
      .min(ASSESSMENT_LIMITS.MIN_DURATION_MINUTES, `Duration must be at least ${ASSESSMENT_LIMITS.MIN_DURATION_MINUTES} minute.`)
      .max(ASSESSMENT_LIMITS.MAX_DURATION_MINUTES, `Duration cannot exceed ${ASSESSMENT_LIMITS.MAX_DURATION_MINUTES} minutes.`)
      .optional(),
    duration: z.coerce.number().optional(),
    passingScore: z.coerce
      .number({ invalid_type_error: "Passing score must be a valid number." })
      .int("Passing score must be a whole number.")
      .min(ASSESSMENT_LIMITS.MIN_PASSING_SCORE, "Passing score cannot be negative.")
      .max(ASSESSMENT_LIMITS.MAX_PASSING_SCORE, `Passing score cannot exceed ${ASSESSMENT_LIMITS.MAX_PASSING_SCORE}.`)
      .default(70),
    maximumScore: z.coerce
      .number({ invalid_type_error: "Maximum score must be a valid number." })
      .int("Maximum score must be a whole number.")
      .min(ASSESSMENT_LIMITS.MINIMUM_SCORE, `Maximum score must be at least ${ASSESSMENT_LIMITS.MINIMUM_SCORE}.`)
      .max(ASSESSMENT_LIMITS.MAXIMUM_SCORE, `Maximum score cannot exceed ${ASSESSMENT_LIMITS.MAXIMUM_SCORE}.`)
      .default(100),
    maxAttempts: z.coerce
      .number({ invalid_type_error: "Maximum attempts must be a valid number." })
      .int("Maximum attempts must be a whole number.")
      .min(ASSESSMENT_LIMITS.MIN_ATTEMPTS, `Maximum attempts must be at least ${ASSESSMENT_LIMITS.MIN_ATTEMPTS}.`)
      .max(ASSESSMENT_LIMITS.MAX_ATTEMPTS, `Maximum attempts cannot exceed ${ASSESSMENT_LIMITS.MAX_ATTEMPTS}.`)
      .default(1),
    attemptsAllowed: z.coerce.number().optional(),
    status: z.preprocess(preprocessEnumFilter, z.enum([ASSESSMENT_STATUS.DRAFT, ASSESSMENT_STATUS.PUBLISHED, ASSESSMENT_STATUS.ACTIVE, ASSESSMENT_STATUS.ARCHIVED]).optional()),
    shuffleQuestions: z.boolean().optional(),
    showResultsImmediately: z.boolean().optional(),
    type: z.preprocess(preprocessEnumFilter, z.enum([ASSESSMENT_TYPE.TECHNICAL, ASSESSMENT_TYPE.GAMING, ASSESSMENT_TYPE.MIXED]).default(ASSESSMENT_TYPE.MIXED)),
    difficulty: z.preprocess(preprocessEnumFilter, z.enum([ASSESSMENT_DIFFICULTY.EASY, ASSESSMENT_DIFFICULTY.MEDIUM, ASSESSMENT_DIFFICULTY.HARD]).default(ASSESSMENT_DIFFICULTY.MEDIUM)),
    publishAt: z.coerce.date({ invalid_type_error: "publishAt must be a valid date." }).optional().nullable(),
    startsAt: z.coerce.date({ invalid_type_error: "startsAt must be a valid date." }).optional().nullable(),
    endsAt: z.coerce.date({ invalid_type_error: "endsAt must be a valid date." }).optional().nullable(),
  })
  .passthrough()
  .transform((data) => {
    const durationVal = data.durationMinutes ?? data.duration ?? 60;
    const attemptsVal = data.maxAttempts ?? data.attemptsAllowed ?? 1;
    return {
      ...data,
      durationMinutes: durationVal,
      maxAttempts: attemptsVal,
    };
  })
  .superRefine((data, ctx) => {
    if (data.passingScore > data.maximumScore) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["passingScore"], message: "Passing score cannot be greater than maximum score." });
    }
    if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be later than startsAt." });
    }
    if (data.publishAt && data.startsAt && data.publishAt > data.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishAt"], message: "publishAt cannot be later than startsAt." });
    }
    if (data.endsAt && !data.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "startsAt is required when endsAt is provided." });
    }
  });

const createAssessmentSchema = z.object({ body: createAssessmentBodySchema });

/**
 * ==========================================================
 * 2. Update Assessment Schema
 * ==========================================================
 */
const updateAssessmentBodySchema = z
  .object({
    title: z.string().trim().min(ASSESSMENT_LIMITS.TITLE_MIN_LENGTH).max(ASSESSMENT_LIMITS.TITLE_MAX_LENGTH).optional(),
    description: optionalTrimmedString(ASSESSMENT_LIMITS.DESCRIPTION_MAX_LENGTH),
    instructions: optionalTrimmedString(ASSESSMENT_LIMITS.INSTRUCTIONS_MAX_LENGTH),
    durationMinutes: z.coerce.number().int().min(ASSESSMENT_LIMITS.MIN_DURATION_MINUTES).max(ASSESSMENT_LIMITS.MAX_DURATION_MINUTES).optional(),
    duration: z.coerce.number().optional(),
    passingScore: z.coerce.number().int().min(ASSESSMENT_LIMITS.MIN_PASSING_SCORE).max(ASSESSMENT_LIMITS.MAX_PASSING_SCORE).optional(),
    maximumScore: z.coerce.number().int().min(ASSESSMENT_LIMITS.MINIMUM_SCORE).max(ASSESSMENT_LIMITS.MAXIMUM_SCORE).optional(),
    maxAttempts: z.coerce.number().int().min(ASSESSMENT_LIMITS.MIN_ATTEMPTS).max(ASSESSMENT_LIMITS.MAX_ATTEMPTS).optional(),
    attemptsAllowed: z.coerce.number().optional(),
    type: z.enum([ASSESSMENT_TYPE.TECHNICAL, ASSESSMENT_TYPE.GAMING, ASSESSMENT_TYPE.MIXED]).optional(),
    difficulty: z.enum([ASSESSMENT_DIFFICULTY.EASY, ASSESSMENT_DIFFICULTY.MEDIUM, ASSESSMENT_DIFFICULTY.HARD]).optional(),
    publishAt: z.coerce.date().optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
  })
  .passthrough()
  .transform((data) => {
    const updateData = { ...data };
    if (data.duration !== undefined && data.durationMinutes === undefined) {
      updateData.durationMinutes = data.duration;
    }
    if (data.attemptsAllowed !== undefined && data.maxAttempts === undefined) {
      updateData.maxAttempts = data.attemptsAllowed;
    }
    return updateData;
  });

const updateAssessmentSchema = z.object({
  params: z.object({ id: z.string().cuid("Invalid assessment ID format.") }),
  body: updateAssessmentBodySchema,
});

/**
 * ==========================================================
 * 3. Assign Questions Schema
 * ==========================================================
 */
const flexibleQuestionItemSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    return { questionId: val, sequence: 1, marks: 1, negativeMarks: 0 };
  }
  if (val && typeof val === "object") {
    const qId = val.questionId || val.id;
    const seq = val.sequence || val.orderIndex || 1;
    const pts = val.marks || val.points || 1;
    const neg = val.negativeMarks || val.negativePoints || 0;
    return {
      questionId: qId,
      sequence: seq,
      marks: pts,
      negativeMarks: neg,
    };
  }
  return val;
}, z.object({
  questionId: z.string({ required_error: "questionId is required." }),
  sequence: z.coerce.number().int().default(1),
  marks: z.coerce.number().default(1),
  negativeMarks: z.coerce.number().default(0),
}));

const assignAssessmentQuestionsSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    questions: z.preprocess(
      (val) => {
        if (!Array.isArray(val)) return val;
        return val.map((item, index) => {
          if (typeof item === "string") {
            return { questionId: item, sequence: index + 1, marks: 1, negativeMarks: 0 };
          }
          if (item && typeof item === "object") {
            return {
              ...item,
              questionId: item.questionId || item.id,
              sequence: item.sequence || item.orderIndex || index + 1,
            };
          }
          return item;
        });
      },
      z.array(flexibleQuestionItemSchema).min(1, "At least one question is required.")
    ),
  }),
});

/**
 * ==========================================================
 * 4. Reorder Questions Schema
 * ==========================================================
 */
const reorderAssessmentQuestionItemSchema = z.object({
  questionId: z.string().cuid("Invalid question ID format."),
  sequence: z.coerce.number().int().min(1),
});

const reorderAssessmentQuestionsSchema = z.object({
  params: z.object({ id: z.string().cuid("Invalid assessment ID format.") }),
  body: z.object({
    questions: z.array(reorderAssessmentQuestionItemSchema).min(1),
  }),
});

/**
 * ==========================================================
 * 5. Assessment Param & Query Schemas
 * ==========================================================
 */
const assessmentIdParamSchema = z.object({
  params: z.object({ id: z.string().cuid("Invalid assessment ID format.") }),
});

const preprocessQueryFilter = (val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();
    if (lower === "all" || lower === "all_status" || lower === "" || lower === "undefined" || lower === "null") {
      return undefined;
    }
    return trimmed.toUpperCase();
  }
  return val;
};

const assessmentQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(ASSESSMENT_PAGINATION.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(ASSESSMENT_PAGINATION.MAX_LIMIT).default(ASSESSMENT_PAGINATION.DEFAULT_LIMIT),
    search: z.preprocess(preprocessQueryFilter, z.string().optional()),
    status: z.preprocess(preprocessQueryFilter, z.enum([ASSESSMENT_STATUS.DRAFT, ASSESSMENT_STATUS.PUBLISHED, ASSESSMENT_STATUS.ACTIVE, ASSESSMENT_STATUS.ARCHIVED]).optional()),
    type: z.preprocess(preprocessQueryFilter, z.enum([ASSESSMENT_TYPE.TECHNICAL, ASSESSMENT_TYPE.GAMING, ASSESSMENT_TYPE.MIXED]).optional()),
    difficulty: z.preprocess(preprocessQueryFilter, z.enum([ASSESSMENT_DIFFICULTY.EASY, ASSESSMENT_DIFFICULTY.MEDIUM, ASSESSMENT_DIFFICULTY.HARD]).optional()),
    sortBy: z.enum(ASSESSMENT_SORT_FIELDS).default(ASSESSMENT_SORT_FIELDS[6]),
    sortOrder: z.enum([ASSESSMENT_SORT_ORDER.ASC, ASSESSMENT_SORT_ORDER.DESC]).default(ASSESSMENT_SORT_ORDER.DESC),
  }),
});

const duplicateAssessmentSchema = z.object({
  params: z.object({ id: z.string().cuid("Invalid assessment ID format.") }),
  body: z.object({
    title: z.string().trim().min(ASSESSMENT_LIMITS.TITLE_MIN_LENGTH).max(ASSESSMENT_LIMITS.TITLE_MAX_LENGTH).optional(),
  }).optional(),
});

module.exports = {
  createAssessmentSchema,
  createAssessmentBodySchema,
  updateAssessmentSchema,
  assignAssessmentQuestionsSchema,
  reorderAssessmentQuestionsSchema,
  assessmentIdParamSchema,
  assessmentQuerySchema,
  duplicateAssessmentSchema,
};
