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
    dateFrom,
    dateTo,
    search,
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

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  if (search) {
    where.OR = [
      { actor: { name: { contains: search, mode: "insensitive" } } },
      { actor: { email: { contains: search, mode: "insensitive" } } },
      { company: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

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
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

const countAuditLogs = async (
  {
    companyId,
    actorUserId,
    action,
    entityType,
    entityId,
    dateFrom,
    dateTo,
    search,
  },
  tx = prisma
) => {
  const where = {};

  if (companyId !== undefined) where.companyId = companyId;
  if (actorUserId !== undefined) where.actorUserId = actorUserId;
  if (action !== undefined) where.action = action;
  if (entityType !== undefined) where.entityType = entityType;
  if (entityId !== undefined) where.entityId = entityId;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  if (search) {
    where.OR = [
      { actor: { name: { contains: search, mode: "insensitive" } } },
      { actor: { email: { contains: search, mode: "insensitive" } } },
      { company: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  return tx.auditLog.count({
    where,
  });
};

module.exports = {
  createAuditLog,
  findAuditLogs,
  countAuditLogs,
};
