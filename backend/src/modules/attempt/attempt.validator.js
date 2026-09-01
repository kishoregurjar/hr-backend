const { z } = require("zod");
const {
  ATTEMPT_STATUS,
  ATTEMPT_LIMITS,
  ATTEMPT_SORT_FIELDS,
  ATTEMPT_ANSWER_LIMITS,
  ATTEMPT_RESULT_SORT_FIELDS,
  ATTEMPT_RESULT_SORT_ORDERS,
  ATTEMPT_RESULT_FILTER_STATUSES,
} = require("./attempt.constants");

/**
 * ==========================================================
 * Query & Preprocessing Helpers
 * ==========================================================
 */
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

/**
 * ==========================================================
 * 1. Start Attempt Schema
 * ==========================================================
 * Endpoint: POST /api/v1/assessments/:assessmentId/attempts
 */
const startAttemptBodySchema = z.object({}).strict();

const startAttemptSchema = z.object({
  params: z.object({
    assessmentId: z.string({ required_error: "assessmentId is required." }).trim().min(1, "Assessment ID is required."),
  }).optional(),
  body: startAttemptBodySchema.optional().default({}),
});

/**
 * ==========================================================
 * 2. Attempt Param Schemas
 * ==========================================================
 */
const attemptIdParamSchema = z.object({
  params: z.object({
    attemptId: z.string({ required_error: "attemptId is required." }).trim().min(1, "Attempt ID is required."),
  }),
});

const assessmentIdParamSchema = z
  .object({
    assessmentId: z
      .string()
      .trim()
      .min(1),
  })
  .strict();

/**
 * ==========================================================
 * 3. Save Answer Schema
 * ==========================================================
 * Endpoint: PUT/PATCH /api/v1/assessment-attempts/:attemptId/answers/:questionId
 */
const saveAnswerBodySchema = z
  .object({
    selectedOptionIds: z
      .array(z.string().trim().min(1, "Option ID cannot be empty."))
      .max(ATTEMPT_ANSWER_LIMITS.MAX_SELECTED_OPTIONS)
      .optional(),
    answerText: z
      .string()
      .trim()
      .max(ATTEMPT_ANSWER_LIMITS.MAX_ANSWER_TEXT_LENGTH)
      .optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasOptions = Array.isArray(data.selectedOptionIds) && data.selectedOptionIds.length > 0;
    const hasText = typeof data.answerText === "string" && data.answerText.length > 0;

    if (!hasOptions && !hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "Either selectedOptionIds or answerText is required.",
      });
    }

    if (hasOptions && hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "Provide either selectedOptionIds or answerText, not both.",
      });
    }

    if (hasOptions) {
      const uniqueIds = new Set(data.selectedOptionIds);
      if (uniqueIds.size !== data.selectedOptionIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedOptionIds"],
          message: "Duplicate option IDs are not allowed.",
        });
      }
    }
  });

const saveAnswerSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(68)
      .max(200)
      .regex(/^inv_[a-f0-9]+$/, "Invalid invitation token format.")
      .optional(),

    attemptQuestionId: z.string().trim().min(1).optional(),
    questionId: z.string().trim().min(1).optional(),

    selectedOptionIds: z
      .array(z.string().trim().min(1))
      .max(100)
      .optional(),

    answerText: z.string().trim().max(10000).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.attemptQuestionId && !data.questionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attemptQuestionId"],
        message: "Either attemptQuestionId or questionId is required.",
      });
    }

    const hasOptions = Array.isArray(data.selectedOptionIds);
    const hasText = typeof data.answerText === "string";

    if (!hasOptions && !hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedOptionIds"],
        message: "Either selectedOptionIds or answerText is required.",
      });
    }

    if (
      hasOptions &&
      data.selectedOptionIds.length > 0 &&
      hasText &&
      data.answerText.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answerText"],
        message: "Answer must contain either selected options or answer text, not both.",
      });
    }

    if (
      hasOptions &&
      data.selectedOptionIds.length === 0 &&
      hasText &&
      data.answerText.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Answer cannot be empty.",
      });
    }
  });

/**
 * ==========================================================
 * 4. Submit Attempt Schema (Token-Based Passwordless Endpoint)
 * ==========================================================
 * Endpoint: POST /api/v1/attempts/submit
 * Only accepts invitation token.
 * candidateId, attemptId, score, passed, evaluationStatus are forbidden.
 */
const submitAttemptBodySchema = z.object({}).strict();

const submitAttemptSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(68, "Token must be at least 68 characters.")
      .max(200, "Token is too long.")
      .regex(/^inv_[a-f0-9]+$/, "Invalid invitation token format.")
      .optional(),
  })
  .strict();

/**
 * ==========================================================
 * 5. Attempt Query Schema
 * ==========================================================
 */
const attemptQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(ATTEMPT_LIMITS.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(ATTEMPT_LIMITS.MAX_LIMIT).default(ATTEMPT_LIMITS.DEFAULT_LIMIT),
    status: z.preprocess(
      preprocessQueryFilter,
      z.enum([
        ATTEMPT_STATUS.IN_PROGRESS,
        ATTEMPT_STATUS.SUBMITTED,
        ATTEMPT_STATUS.EXPIRED,
        ATTEMPT_STATUS.CANCELLED,
      ]).optional()
    ),
    sortBy: z.enum(ATTEMPT_SORT_FIELDS).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});

/**
 * ==========================================================
 * 6. Bulk Candidate Invitation Schema
 * ==========================================================
 * Endpoint: POST /api/v1/assessments/:assessmentId/invitations/bulk
 */
const candidateItemSchema = z.union([
  z.string().trim().min(1),
  z.object({
    email: z.string().trim().email(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
  }).passthrough(),
]);

const createBulkInvitationSchema = z
  .object({
    candidateIds: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(500)
      .superRefine((candidateIds, ctx) => {
        const uniqueIds = new Set(candidateIds);
        if (uniqueIds.size !== candidateIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate candidate IDs are not allowed.",
          });
        }
      })
      .optional(),
    candidates: z
      .array(candidateItemSchema)
      .min(1)
      .max(500)
      .optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.candidateIds && !data.candidates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidateIds"],
        message: "Either candidateIds or candidates array is required.",
      });
    }
  });

/**
 * ==========================================================
 * 7. Start Attempt By Invitation Token Schema
 * ==========================================================
 * Endpoint: POST /api/v1/attempts/start-by-token
 * Strictly accepts only the token.
 * candidateId and assessmentId are NEVER accepted from client.
 */
const startAttemptByTokenSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(68, "Token must be at least 68 characters.")
      .max(200, "Token is too long.")
      .regex(/^inv_[a-f0-9]+$/, "Invalid invitation token format.")
      .optional(),
  })
  .strict();

/**
 * ==========================================================
 * 8. Current Active Attempt Query Schema
 * ==========================================================
 * Endpoint: GET /api/v1/attempts/current?token=<INVITATION_TOKEN>
 * Resumes candidate's active IN_PROGRESS attempt safely.
 * candidateId, assessmentId, attemptId are NEVER accepted.
 */
const currentAttemptQuerySchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(68, "Token must be at least 68 characters.")
      .max(200, "Token is too long.")
      .regex(/^inv_[a-f0-9]+$/, "Invalid invitation token format.")
      .optional(),
  })
  .strict();

/**
 * ==========================================================
 * 9. Assessment Results Query Schema (HR Analytics Dashboard)
 * ==========================================================
 * Endpoint: GET /api/v1/assessments/:assessmentId/results
 */
const assessmentResultsQuerySchema = z
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
      .max(100)
      .default(10),

    search: z
      .string()
      .trim()
      .max(255)
      .optional(),

    status: z
      .enum(
        ATTEMPT_RESULT_FILTER_STATUSES
      )
      .optional(),

    passed: z
      .enum([
        "true",
        "false",
      ])
      .transform(
        (value) =>
          value === "true"
      )
      .optional(),

    sortBy: z
      .enum(
        ATTEMPT_RESULT_SORT_FIELDS
      )
      .default("createdAt"),

    sortOrder: z
      .enum(
        ATTEMPT_RESULT_SORT_ORDERS
      )
      .default("desc"),
  })
  .strict();

const attemptResultParamsSchema = z
  .object({
    assessmentId: z
      .string()
      .trim()
      .min(1),

    attemptId: z
      .string()
      .trim()
      .min(1),
  })
  .strict();

/* ==========================================
 * Candidate OTP Validation
 * ========================================== */

const sendCandidateOtpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Valid candidate email is required.")
      .max(254, "Email address is too long."),

    invitationToken: z
      .string()
      .trim()
      .min(1, "Invitation token is required.")
      .max(512, "Invitation token is too long."),
  })
  .strict();

const verifyCandidateOtpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Valid candidate email is required.")
      .max(254, "Email address is too long."),

    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "OTP must be exactly 6 digits."),

    invitationToken: z
      .string()
      .trim()
      .min(1, "Invitation token is required.")
      .max(512, "Invitation token is too long."),
  })
  .strict();

const evaluateAttemptAnswerSchema = z
  .object({
    attemptAnswerId: z.string().trim().min(1, "Attempt answer ID is required."),

    evaluationStatus: z.enum(["CORRECT", "INCORRECT", "UNANSWERED"]),

    marksAwarded: z.number().min(0).max(100000),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.evaluationStatus === "CORRECT" && data.marksAwarded <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Correct answers must receive positive marks.",
        path: ["marksAwarded"],
      });
    }

    if (data.evaluationStatus === "INCORRECT" && data.marksAwarded !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incorrect subjective answers must not receive positive marks.",
        path: ["marksAwarded"],
      });
    }
  });

const attemptResultQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["IN_PROGRESS", "SUBMITTED", "EXPIRED", "CANCELLED"]).optional(),
    search: z.string().trim().max(255).optional(),
    sortBy: z.enum(["createdAt", "startedAt", "submittedAt", "score", "percentage"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

const assessmentAnalyticsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`from` date must be before or equal to `to` date.",
        path: ["from"],
      });
    }
  });

module.exports = {
  startAttemptBodySchema,
  startAttemptSchema,
  attemptIdParamSchema,
  assessmentIdParamSchema,
  saveAnswerBodySchema,
  saveAnswerSchema,
  submitAttemptBodySchema,
  submitAttemptSchema,
  attemptQuerySchema,
  createBulkInvitationSchema,
  startAttemptByTokenSchema,
  currentAttemptQuerySchema,
  assessmentResultsQuerySchema,
  attemptResultParamsSchema,
  sendCandidateOtpSchema,
  verifyCandidateOtpSchema,
  evaluateAttemptAnswerSchema,
  attemptResultQuerySchema,
  assessmentAnalyticsQuerySchema,
};
