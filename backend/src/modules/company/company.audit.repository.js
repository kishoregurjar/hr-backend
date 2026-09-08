"use strict";

const { prisma } = require("../../config/prisma");

const createAuditLog = async (data, tx = prisma) => {
  return tx.auditLog.create({
    data,
  });
};

const findAuditLogs = async (
  {
    companyId,
    actorUserId,
    action,
    entityType,
    entityId,
    skip = 0,
    take = 20,
  },
  tx = prisma
) => {
  const where = {};

  if (companyId !== undefined) where.companyId = companyId;
  if (actorUserId !== undefined) where.actorUserId = actorUserId;
  if (action !== undefined) where.action = action;
  if (entityType !== undefined) where.entityType = entityType;
  if (entityId !== undefined) where.entityId = entityId;

  return tx.auditLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take,
    select: {
      id: true,
      companyId: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

const countAuditLogs = async (
  { companyId, actorUserId, action, entityType, entityId },
  tx = prisma
) => {
  const where = {};

  if (companyId !== undefined) where.companyId = companyId;
  if (actorUserId !== undefined) where.actorUserId = actorUserId;
  if (action !== undefined) where.action = action;
  if (entityType !== undefined) where.entityType = entityType;
  if (entityId !== undefined) where.entityId = entityId;

  return tx.auditLog.count({
    where,
  });
};

module.exports = {
  createAuditLog,
  findAuditLogs,
  countAuditLogs,
};
