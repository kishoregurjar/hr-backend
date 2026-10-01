"use strict";

const { z } = require("zod");
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require("../company/company.audit.constants");

const validActions = Object.values(AUDIT_ACTIONS);
const validEntityTypes = Object.values(AUDIT_ENTITY_TYPES);

const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  actorUserId: z.string().trim().min(1).optional(),

  companyId: z.string().trim().min(1).optional(),

  action: z
    .string()
    .trim()
    .refine((val) => validActions.includes(val), {
      message: "Invalid action value",
    })
    .optional(),

  entityType: z
    .string()
    .trim()
    .refine((val) => validEntityTypes.includes(val), {
      message: "Invalid entityType value",
    })
    .optional(),

  entityId: z.string().trim().min(1).optional(),

  search: z.string().trim().max(200).optional(),

  dateFrom: z
    .string()
    .trim()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "dateFrom must be a valid ISO date string",
    })
    .optional(),

  dateTo: z
    .string()
    .trim()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "dateTo must be a valid ISO date string",
    })
    .optional(),
});

module.exports = {
  listAuditLogsSchema,
};
