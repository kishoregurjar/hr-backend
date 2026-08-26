"use strict";

const { prisma } = require("../config/prisma");

const createIdempotencyKey = async (
  {
    idempotencyKey,
    userId = null,
    scope,
    requestHash,
    status = "PROCESSING",
    expiresAt,
  },
  tx = prisma
) => {
  return tx.idempotencyKey.create({
    data: {
      idempotencyKey,
      userId,
      scope,
      requestHash,
      status,
      expiresAt,
    },
  });
};

const findIdempotencyKey = async (idempotencyKey, tx = prisma) => {
  return tx.idempotencyKey.findUnique({
    where: {
      idempotencyKey,
    },
  });
};

const updateIdempotencyKey = async (
  {
    idempotencyKey,
    status,
    responseCode = undefined,
    responseBody = undefined,
  },
  tx = prisma
) => {
  return tx.idempotencyKey.update({
    where: {
      idempotencyKey,
    },
    data: {
      status,
      ...(responseCode !== undefined
        ? {
            responseCode,
          }
        : {}),
      ...(responseBody !== undefined
        ? {
            responseBody,
          }
        : {}),
    },
  });
};

const deleteIdempotencyKey = async (idempotencyKey, tx = prisma) => {
  return tx.idempotencyKey.delete({
    where: {
      idempotencyKey,
    },
  });
};

const deleteExpiredIdempotencyKeys = async (now = new Date(), tx = prisma) => {
  return tx.idempotencyKey.deleteMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });
};

module.exports = {
  createIdempotencyKey,
  findIdempotencyKey,
  updateIdempotencyKey,
  deleteIdempotencyKey,
  deleteExpiredIdempotencyKeys,
};
