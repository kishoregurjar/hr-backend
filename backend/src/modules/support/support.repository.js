"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Create a new support request.
 */
const createSupportRequest = async (data, tx = prisma) => {
  return tx.supportRequest.create({ data });
};

/**
 * Find a support request by ID.
 */
const findById = async (id, tx = prisma) => {
  return tx.supportRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });
};

/**
 * List support requests for a specific HR user with pagination.
 */
const findByUserId = async ({ userId, page, limit, status, sortBy, sortOrder }, tx = prisma) => {
  const where = { userId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    tx.supportRequest.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    tx.supportRequest.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * List all support requests (Super Admin) with pagination, filtering, and user/company details.
 */
const findAll = async ({ page, limit, status, sortBy, sortOrder }, tx = prisma) => {
  const where = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    tx.supportRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    tx.supportRequest.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Update a support request's status.
 */
const updateStatus = async (id, status, tx = prisma) => {
  return tx.supportRequest.update({
    where: { id },
    data: { status },
    include: {
      user: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });
};

/**
 * Save an admin reply and update status.
 */
const saveReply = async (id, { adminReply, repliedById, status }, tx = prisma) => {
  return tx.supportRequest.update({
    where: { id },
    data: {
      adminReply,
      repliedById,
      repliedAt: new Date(),
      status: status || "RESOLVED",
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });
};

/**
 * Check for recent duplicate submission by same user with same subject (within 60s).
 */
const findRecentDuplicate = async (userId, subject, windowMs = 60000, tx = prisma) => {
  const cutoff = new Date(Date.now() - windowMs);
  return tx.supportRequest.findFirst({
    where: {
      userId,
      subject,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
  });
};

module.exports = {
  createSupportRequest,
  findById,
  findByUserId,
  findAll,
  updateStatus,
  saveReply,
  findRecentDuplicate,
};
