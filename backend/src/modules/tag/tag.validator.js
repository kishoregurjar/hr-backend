const { z } = require("zod");
const { TAG_LIMITS } = require("./tag.constants");

/**
 * ==========================================================
 * Tag Module Unified Zod Validation Schemas
 * ==========================================================
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const normalizeOptionalString = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const createTagSchema = z
  .object({
    name: z.preprocess(
      normalizeString,
      z
        .string({
          required_error: "Tag name is required.",
          invalid_type_error: "Tag name must be a string.",
        })
        .min(1, "Tag name is required.")
        .max(50, "Tag name cannot exceed 50 characters.")
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(500, "Description cannot exceed 500 characters.").optional()
    ),
  })
  .strict();

const updateTagSchema = z
  .object({
    name: z.preprocess(
      normalizeOptionalString,
      z.string().min(1).max(50).optional()
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(500).optional()
    ),
  })
  .strict();

const tagIdParamSchema = z.object({
  id: z.string().cuid("Invalid tag ID format."),
});

const tagQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
});

module.exports = {
  createTagSchema,
  updateTagSchema,
  tagIdParamSchema,
  tagQuerySchema,
};
