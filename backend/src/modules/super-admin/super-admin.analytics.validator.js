"use strict";

const { z } = require("zod");

const isValidIsoDate = (str) => {
  if (typeof str !== "string" || !str.trim()) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
};

const getAnalyticsSchema = z
  .object({
    preset: z.enum(["7d", "30d", "90d", "custom", "all"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const preset = data.preset || (data.dateFrom || data.dateTo ? "custom" : undefined);

    if (preset === "custom") {
      if (!data.dateFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFrom"],
          message: "dateFrom is required when using custom preset",
        });
      } else if (!isValidIsoDate(data.dateFrom)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFrom"],
          message: "dateFrom must be a valid ISO date string",
        });
      }

      if (!data.dateTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateTo"],
          message: "dateTo is required when using custom preset",
        });
      } else if (!isValidIsoDate(data.dateTo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateTo"],
          message: "dateTo must be a valid ISO date string",
        });
      }

      if (
        data.dateFrom &&
        data.dateTo &&
        isValidIsoDate(data.dateFrom) &&
        isValidIsoDate(data.dateTo)
      ) {
        const fromTime = new Date(data.dateFrom).getTime();
        const toTime = new Date(data.dateTo).getTime();
        if (fromTime > toTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dateFrom"],
            message: "dateFrom cannot be after dateTo",
          });
        }
      }
    } else {
      if (data.dateFrom && !isValidIsoDate(data.dateFrom)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFrom"],
          message: "dateFrom must be a valid ISO date string",
        });
      }
      if (data.dateTo && !isValidIsoDate(data.dateTo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateTo"],
          message: "dateTo must be a valid ISO date string",
        });
      }
    }
  });

module.exports = {
  getAnalyticsSchema,
  isValidIsoDate,
};
