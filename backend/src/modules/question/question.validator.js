const { z } = require("zod");
const {
  QUESTION_TYPES,
  QUESTION_DIFFICULTY,
  QUESTION_STATUS,
  QUESTION_LIMITS,
} = require("./question.constants");

/**
 * ==========================================================
 * Question Module Unified Validation Rules & Schemas
 * ==========================================================
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

const validateNegativeMarks = (data, ctx) => {
  if (data.negativeMarks > data.marks) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["negativeMarks"],
      message: "Negative marks cannot be greater than maximum marks.",
    });
  }
};

const validateOptionCount = (data, ctx) => {
  const isChoiceType =
    data.type === QUESTION_TYPES.SINGLE_CHOICE ||
    data.type === QUESTION_TYPES.MULTIPLE_CHOICE ||
    data.type === QUESTION_TYPES.TRUE_FALSE;

  if (isChoiceType) {
    if (!data.options || data.options.length < QUESTION_LIMITS.MIN_OPTIONS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `Multiple choice questions must have at least ${QUESTION_LIMITS.MIN_OPTIONS} options.`,
      });
      return false;
    }

    if (data.options.length > QUESTION_LIMITS.MAX_OPTIONS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `Multiple choice questions cannot exceed ${QUESTION_LIMITS.MAX_OPTIONS} options.`,
      });
      return false;
    }
  }

  return true;
};

const validateDuplicateOptions = (data, ctx) => {
  if (!Array.isArray(data.options)) return;
  const seenTexts = new Set();
  data.options.forEach((opt, index) => {
    const textLower = opt.optionText.trim().toLowerCase();
    if (seenTexts.has(textLower)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options", index, "optionText"],
        message: "Duplicate option texts are not allowed.",
      });
    }
    seenTexts.add(textLower);
  });
};

const validateCorrectAnswers = (data, ctx) => {
  if (!Array.isArray(data.options) || data.options.length === 0) return;

  const correctCount = data.options.filter((opt) => opt.isCorrect).length;

  if (data.type === QUESTION_TYPES.SINGLE_CHOICE || data.type === QUESTION_TYPES.TRUE_FALSE) {
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Single choice and True/False questions must have exactly one correct option.",
      });
    }
  } else if (data.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
    if (correctCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Multiple choice questions must have at least one correct option.",
      });
    }
  }
};

const optionSchema = z.object({
  optionText: z
    .string()
    .trim()
    .min(1, "Option text is required.")
    .max(500, "Option text cannot exceed 500 characters."),
  isCorrect: z.boolean(),
  sequence: z.number().int().positive().optional(),
});

const createQuestionBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Question title must be at least 5 characters.")
      .max(1000, "Question title cannot exceed 1000 characters."),
    description: z.string().trim().max(5000).optional().nullable(),
    explanation: z.string().trim().max(5000).optional().nullable(),
    type: z.nativeEnum(QUESTION_TYPES),
    difficulty: z.nativeEnum(QUESTION_DIFFICULTY),
    status: z.nativeEnum(QUESTION_STATUS).default(QUESTION_STATUS.DRAFT),
    marks: z
      .number()
      .int()
      .min(QUESTION_LIMITS.MIN_MARKS)
      .max(QUESTION_LIMITS.MAX_MARKS)
      .default(1),
    negativeMarks: z.number().min(0).default(0),
    estimatedTime: z
      .number()
      .int()
      .min(QUESTION_LIMITS.MIN_ESTIMATED_TIME)
      .max(QUESTION_LIMITS.MAX_ESTIMATED_TIME)
      .optional()
      .nullable(),
    shuffleOptions: z.boolean().default(true),
    categoryId: z.string().trim().min(1, "Category is required."),
    tagIds: z.array(z.string().trim()).default([]),
    options: z.array(optionSchema).optional().default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateNegativeMarks(data, ctx);
    const validCount = validateOptionCount(data, ctx);
    if (validCount) {
      validateDuplicateOptions(data, ctx);
      validateCorrectAnswers(data, ctx);
    }
  });

const createQuestionSchema = z.object({
  body: createQuestionBodySchema,
});

const updateQuestionBodySchema = z
  .object({
    title: z.string().trim().min(5).max(1000).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    explanation: z.string().trim().max(5000).optional().nullable(),
    type: z.nativeEnum(QUESTION_TYPES).optional(),
    difficulty: z.nativeEnum(QUESTION_DIFFICULTY).optional(),
    status: z.nativeEnum(QUESTION_STATUS).optional(),
    marks: z.number().int().min(QUESTION_LIMITS.MIN_MARKS).max(QUESTION_LIMITS.MAX_MARKS).optional(),
    negativeMarks: z.number().min(0).optional(),
    estimatedTime: z.number().int().min(QUESTION_LIMITS.MIN_ESTIMATED_TIME).max(QUESTION_LIMITS.MAX_ESTIMATED_TIME).optional().nullable(),
    shuffleOptions: z.boolean().optional(),
    categoryId: z.string().trim().min(1).optional(),
    tagIds: z.array(z.string().trim()).optional(),
    options: z.array(optionSchema).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.marks !== undefined && data.negativeMarks !== undefined) {
      validateNegativeMarks(data, ctx);
    }
    if (data.options !== undefined && data.type !== undefined) {
      const validCount = validateOptionCount(data, ctx);
      if (validCount) {
        validateDuplicateOptions(data, ctx);
        validateCorrectAnswers(data, ctx);
      }
    }
  });

const updateQuestionSchema = z.object({
  body: updateQuestionBodySchema,
});

const questionIdParamSchema = z.object({
  id: z.string().cuid("Invalid question ID format."),
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

const preprocessIdFilter = (val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();
    if (lower === "all" || lower === "all_status" || lower === "" || lower === "undefined" || lower === "null") {
      return undefined;
    }
    return trimmed;
  }
  return val;
};

const questionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.preprocess(preprocessIdFilter, z.string().optional()),
  type: z.preprocess(preprocessQueryFilter, z.nativeEnum(QUESTION_TYPES).optional()),
  difficulty: z.preprocess(preprocessQueryFilter, z.nativeEnum(QUESTION_DIFFICULTY).optional()),
  status: z.preprocess(preprocessQueryFilter, z.nativeEnum(QUESTION_STATUS).optional()),
  categoryId: z.preprocess(preprocessIdFilter, z.string().optional()),
  tagId: z.preprocess(preprocessIdFilter, z.string().optional()),
});

module.exports = {
  createQuestionSchema,
  createQuestionBodySchema,
  updateQuestionSchema,
  questionIdParamSchema,
  questionQuerySchema,
  optionSchema,
};
