"use strict";

const { AppError } = require("../utils/app-error");
const { createRequestHash } = require("../utils/request-hash");
const {
  createProcessingRecord,
  getExistingRecord,
  assertRequestMatches,
  assertIdentityMatches,
} = require("../services/idempotency.service");

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const IDEMPOTENCY_HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 128;

const getIdempotencyKey = (req) => {
  const value = req.get ? req.get(IDEMPOTENCY_HEADER) : req.headers?.[IDEMPOTENCY_HEADER];

  if (!value) {
    return null;
  }

  const key = String(value).trim();

  if (!key) {
    throw new AppError("Idempotency-Key cannot be empty.", {
      statusCode: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
    });
  }

  if (key.length > MAX_KEY_LENGTH) {
    throw new AppError("Idempotency-Key is too long.", {
      statusCode: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
    });
  }

  return key;
};

const createIdempotencyMiddleware =
  ({ scope, ttlSeconds = DEFAULT_TTL_SECONDS, required = true }) =>
  async (req, res, next) => {
    try {
      const idempotencyKey = getIdempotencyKey(req);

      if (!idempotencyKey) {
        if (required) {
          throw new AppError("Idempotency-Key header is required.", {
            statusCode: 400,
            code: "IDEMPOTENCY_KEY_REQUIRED",
          });
        }

        return next();
      }

      const requestHash = createRequestHash({
        method: req.method,
        path: req.originalUrl || req.url,
        body: req.body || {},
        params: req.params || {},
        query: req.query || {},
      });

      const userId = req.user?.id || req.user?.userId || null;

      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      /*
       * First attempt to reserve the idempotency key atomically.
       */
      const created = await createProcessingRecord({
        idempotencyKey,
        userId,
        scope,
        requestHash,
        expiresAt,
      });

      if (created) {
        req.idempotency = {
          key: idempotencyKey,
          scope,
          requestHash,
          owner: true,
        };

        return next();
      }

      /*
       * Key already exists in database.
       */
      const existing = await getExistingRecord(idempotencyKey);

      if (!existing) {
        throw new AppError("Unable to resolve idempotency state.", {
          statusCode: 503,
          code: "IDEMPOTENCY_STATE_UNAVAILABLE",
        });
      }

      assertIdentityMatches({
        existing,
        userId,
        scope,
      });

      assertRequestMatches({
        existing,
        requestHash,
      });

      /*
       * Previous request is still being processed.
       */
      if (existing.status === "PROCESSING") {
        throw new AppError(
          "A request with this Idempotency-Key is already being processed.",
          {
            statusCode: 409,
            code: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
          }
        );
      }

      /*
       * Previous request completed -> replay cached response.
       */
      if (existing.status === "COMPLETED") {
        if (existing.responseCode === null) {
          throw new AppError("Idempotent response is unavailable.", {
            statusCode: 503,
            code: "IDEMPOTENCY_RESPONSE_UNAVAILABLE",
          });
        }

        res.status(existing.responseCode);
        return res.json(existing.responseBody);
      }

      /*
       * FAILED records handled by retry policy.
       */
      if (existing.status === "FAILED") {
        throw new AppError(
          "The previous request failed. Please retry with the same Idempotency-Key.",
          {
            statusCode: 409,
            code: "IDEMPOTENCY_PREVIOUS_REQUEST_FAILED",
          }
        );
      }

      throw new AppError("Invalid idempotency state.", {
        statusCode: 500,
        code: "INVALID_IDEMPOTENCY_STATE",
        isOperational: false,
      });
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  createIdempotencyMiddleware,
  getIdempotencyKey,
};
