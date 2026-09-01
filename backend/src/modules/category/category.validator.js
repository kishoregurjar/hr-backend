const { z } = require("zod");
const { CATEGORY_LIMITS } = require("./category.constants");

/**
 * ==========================================================
 * Category Module Unified Zod Validation Schemas
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

const createCategorySchema = z
  .object({
    name: z.preprocess(
      normalizeString,
      z
        .string({
          required_error: "Category name is required.",
          invalid_type_error: "Category name must be a string.",
        })
        .min(1, "Category name is required.")
        .max(100, "Category name cannot exceed 100 characters.")
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(1000, "Description cannot exceed 1000 characters.").optional()
    ),
  })
  .strict();

const updateCategorySchema = z
  .object({
    name: z.preprocess(
      normalizeOptionalString,
      z.string().min(1).max(100).optional()
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(1000).optional()
    ),
  })
  .strict();

const categoryIdParamSchema = z.object({
  id: z.string().cuid("Invalid category ID format."),
});

const categoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  categoryQuerySchema,
};
