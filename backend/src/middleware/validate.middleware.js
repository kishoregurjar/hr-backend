"use strict";

const { z } = require("zod");
const { badRequest } = require("../utils/app-error");

/**
 * ==========================================================
 * Enterprise Production Validation Middleware
 * ==========================================================
 * Intelligently validates HTTP requests against Zod schemas.
 * Supports:
 * 1. Wrapped Schemas: ({ body, query, params, cookies })
 * 2. Unwrapped Schemas: Merges req.params, req.query, and req.body
 * 3. Schema Objects: { body: schema } or { query: schema }
 * ==========================================================
 */
const validateRequest = (schema, targetKey) => async (req, res, next) => {
  try {
    let effectiveSchema = schema;

    if (schema && typeof schema === "object" && typeof schema.parseAsync !== "function" && typeof schema.safeParseAsync !== "function") {
      const shape = {};
      if (schema.body) shape.body = schema.body;
      if (schema.query) shape.query = schema.query;
      if (schema.params) shape.params = schema.params;
      if (schema.cookies) shape.cookies = schema.cookies;
      effectiveSchema = z.object(shape);
    } else if (typeof targetKey === "string") {
      effectiveSchema = z.object({ [targetKey]: schema });
    }

    let targetSchema = effectiveSchema;
    while (targetSchema._def && targetSchema._def.schema) {
      targetSchema = targetSchema._def.schema;
    }

    const shape = targetSchema.shape || {};
    const isWrappedSchema = Boolean(shape.body || shape.query || shape.params || shape.cookies);

    let dataToParse;
    if (isWrappedSchema) {
      dataToParse = {
        body: req.body || {},
        query: req.query || {},
        params: req.params || {},
        cookies: req.cookies || {},
      };
    } else {
      dataToParse = {
        ...(req.params || {}),
        ...(req.query || {}),
        ...(req.body || {}),
      };
    }

    const parseMethod = typeof effectiveSchema.safeParseAsync === "function"
      ? effectiveSchema.safeParseAsync.bind(effectiveSchema)
      : async (val) => effectiveSchema.safeParse(val);

    const result = await parseMethod(dataToParse);

    if (!result.success) {
      const details = result.error.issues.map((issue) => {
        const path = issue.path || [];
        let fieldPath = path.join(".");
        if (fieldPath.startsWith("body.")) fieldPath = fieldPath.substring(5);
        else if (fieldPath.startsWith("query.")) fieldPath = fieldPath.substring(6);
        else if (fieldPath.startsWith("params.")) fieldPath = fieldPath.substring(7);
        return {
          field: fieldPath || "body",
          message: issue.message,
        };
      });

      return next(
        badRequest(
          "Request validation failed.",
          "VALIDATION_ERROR",
          details
        )
      );
    }

    const parsed = result.data;

    if (isWrappedSchema) {
      if (parsed.body) req.body = parsed.body;
      if (parsed.query && req.query && typeof req.query === "object") {
        try {
          Object.assign(req.query, parsed.query);
        } catch {
          // Ignore getter assignment error
        }
      }
      if (parsed.params && req.params && typeof req.params === "object") {
        try {
          Object.assign(req.params, parsed.params);
        } catch {
          // Ignore getter assignment error
        }
      }
      req.validated = parsed;
      req.validatedData = {
        ...(parsed.query || {}),
        ...(parsed.params || {}),
        ...(parsed.body || {}),
      };
    } else {
      if (req.method === "GET" || req.method === "DELETE") {
        if (req.query && typeof req.query === "object") {
          try {
            Object.assign(req.query, parsed);
          } catch {
            // Ignore getter assignment error
          }
        }
      } else {
        req.body = parsed;
      }
      req.validated = parsed;
      req.validatedData = parsed;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = validateRequest;
module.exports.validateRequest = validateRequest;
