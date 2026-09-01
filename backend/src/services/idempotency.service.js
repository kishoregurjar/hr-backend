"use strict";

const {
  createIdempotencyKey,
  findIdempotencyKey,
  updateIdempotencyKey,
  deleteIdempotencyKey,
} = require("../repositories/idempotency.repository");

const { AppError } = require("../utils/app-error");

const createProcessingRecord = async ({
  idempotencyKey,
  userId = null,
  scope,
  requestHash,
  expiresAt,
}) => {
  try {
    return await createIdempotencyKey({
      idempotencyKey,
      userId,
      scope,
      requestHash,
      status: "PROCESSING",
      expiresAt,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return null;
    }

    throw error;
  }
};

const getExistingRecord = async (idempotencyKey) => {
  return findIdempotencyKey(idempotencyKey);
};

const assertRequestMatches = ({ existing, requestHash }) => {
  if (existing.requestHash !== requestHash) {
    throw new AppError(
      "The Idempotency-Key was already used with a different request.",
      {
        statusCode: 409,
        code: "IDEMPOTENCY_KEY_REUSED",
      }
    );
  }
};

const assertIdentityMatches = ({ existing, userId, scope }) => {
  if (existing.scope !== scope) {
    throw new AppError(
      "The Idempotency-Key cannot be reused for a different operation.",
      {
        statusCode: 409,
        code: "IDEMPOTENCY_SCOPE_MISMATCH",
      }
    );
  }

  if (existing.userId && userId && existing.userId !== userId) {
    throw new AppError(
      "The Idempotency-Key cannot be reused by another user.",
      {
        statusCode: 409,
        code: "IDEMPOTENCY_IDENTITY_MISMATCH",
      }
    );
  }
};

const markCompleted = async ({ idempotencyKey, responseCode, responseBody }) => {
  return updateIdempotencyKey({
    idempotencyKey,
    status: "COMPLETED",
    responseCode,
    responseBody,
  });
};

const clearProcessingRecord = async ({ idempotencyKey }) => {
  return deleteIdempotencyKey(idempotencyKey);
};

const executeIdempotent = async ({ idempotencyKey, execute }) => {
  try {
    const result = await execute();

    await markCompleted({
      idempotencyKey,
      responseCode: result?.statusCode || 200,
      responseBody: result?.response !== undefined ? result.response : result,
    });

    return result;
  } catch (error) {
    try {
      await clearProcessingRecord({
        idempotencyKey,
      });
    } catch (cleanupError) {
      console.error({
        type: "IDEMPOTENCY_CLEANUP_ERROR",
        message: cleanupError.message,
      });
    }

    throw error;
  }
};

module.exports = {
  createProcessingRecord,
  getExistingRecord,
  assertRequestMatches,
  assertIdentityMatches,
  markCompleted,
  clearProcessingRecord,
  executeIdempotent,
};
