"use strict";

const { prisma } = require("../../config/prisma");

const createAttemptAuditLog = async ({
  event,
  attemptId = null,
  candidateId = null,
  assessmentId = null,
  questionId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
  tx = null,
}) => {
  const client = tx || prisma;

  return client.attemptAuditLog.create({
    data: {
      event,
      attemptId,
      candidateId,
      assessmentId,
      questionId,
      metadata,
      ipAddress,
      userAgent,
    },
  });
};

const findAttemptAuditLogs = async ({
  attemptId,
  limit = 100,
  cursor = null,
}) => {
  return prisma.attemptAuditLog.findMany({
    where: {
      attemptId,
    },

    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],

    take: limit,

    ...(cursor
      ? {
          skip: 1,
          cursor: {
            id: cursor,
          },
        }
      : {}),
  });
};

module.exports = {
  createAttemptAuditLog,
  findAttemptAuditLogs,
};
