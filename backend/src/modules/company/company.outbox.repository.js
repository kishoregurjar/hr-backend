"use strict";

const { prisma } = require("../../config/prisma");

const createOutboxEvent = async (data, tx = prisma) => {
  return tx.outboxEvent.create({
    data,
  });
};

const claimPendingEvents = async (
  { batchSize = 20, staleLockMinutes = 10, now = new Date() } = {},
  tx = prisma
) => {

  return tx.$queryRaw`
    UPDATE "OutboxEvent"
    SET
      "status" = 'PROCESSING'::"OutboxEventStatus",
      "lockedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id"
      FROM "OutboxEvent"
      WHERE
        (
          "status"::text = 'PENDING'
          AND "availableAt" <= ${now}
        )
        OR
        (
          "status"::text = 'PROCESSING'
          AND "lockedAt" IS NOT NULL
          AND "lockedAt" < ${new Date(now.getTime() - staleLockMinutes * 60 * 1000)}
        )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    RETURNING
      "id",
      "eventType",
      "aggregateId",
      "payload",
      "attempts",
      "status",
      "availableAt",
      "lockedAt",
      "createdAt",
      "updatedAt"
  `;
};

const markCompleted = async (eventId, tx = prisma) => {
  return tx.outboxEvent.update({
    where: {
      id: eventId,
    },
    data: {
      status: "COMPLETED",
      processedAt: new Date(),
      lockedAt: null,
      lastError: null,
    },
  });
};

const markFailed = async (
  eventId,
  { attempts, availableAt, lastError },
  tx = prisma
) => {
  return tx.outboxEvent.update({
    where: {
      id: eventId,
    },
    data: {
      status: "PENDING",
      attempts,
      availableAt,
      lockedAt: null,
      lastError,
    },
  });
};

const markPermanentlyFailed = async (
  eventId,
  { attempts, lastError },
  tx = prisma
) => {
  return tx.outboxEvent.update({
    where: {
      id: eventId,
    },
    data: {
      status: "FAILED",
      attempts,
      lockedAt: null,
      lastError,
    },
  });
};

const deleteEventsByAggregateIds = async (
  aggregateIds,
  eventType,
  tx = prisma
) => {
  if (!aggregateIds || !aggregateIds.length) {
    return {
      count: 0,
    };
  }

  return tx.outboxEvent.deleteMany({
    where: {
      eventType,
      aggregateId: {
        in: aggregateIds,
      },
      status: {
        in: ["PENDING", "PROCESSING"],
      },
    },
  });
};

module.exports = {
  createOutboxEvent,
  claimPendingEvents,
  markCompleted,
  markFailed,
  markPermanentlyFailed,
  deleteEventsByAggregateIds,
};

