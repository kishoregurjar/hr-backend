"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Create a new support request.
 */
const createSupportRequest = async (data, tx = prisma) => {
  return tx.supportRequest.create({ data });
};

/**
 * Find a support request by ID with submitter and company relations.
 */
const findById = async (id, tx = prisma) => {
  return tx.supportRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true, slug: true } },
    },
  });
};

/**
 * List support requests for a specific HR user with pagination.
 */
const findByUserId = async (
  { userId, page = 1, limit = 20, status, sortBy = "createdAt", sortOrder = "desc" },
  tx = prisma
) => {
  const where = { userId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    tx.supportRequest.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    tx.supportRequest.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * List support requests for a specific tenant/company with pagination (Company Owner/Admin).
 */
const findByCompanyId = async (
  { companyId, page = 1, limit = 20, status, sortBy = "createdAt", sortOrder = "desc" },
  tx = prisma
) => {
  const where = { companyId };
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

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * List platform-level support requests (Super Admin) with pagination, filtering, and user details.
 * Excludes all ordinary tenant support tickets (where companyId IS NOT NULL).
 */
const findAll = async (
  { page = 1, limit = 20, status, sortBy = "createdAt", sortOrder = "desc" },
  tx = prisma
) => {
  // Strictly filter for platform-level requests (companyId IS NULL)
  const where = { companyId: null };
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

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
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

/**
 * Find active Owner and Admin members for a company (ordered: OWNER first, then ADMIN).
 */
const findCompanyActiveAdmins = async (companyId, tx = prisma) => {
  return tx.companyMember.findMany({
    where: {
      companyId,
      role: { in: ["OWNER", "ADMIN"] },
      user: { status: "ACTIVE" },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: [
      { role: "asc" },
      { createdAt: "asc" },
    ],
  });
};

/**
 * Find a specific company membership record for a user.
 */
const findCompanyMember = async (companyId, userId, tx = prisma) => {
  return tx.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId,
        userId,
      },
    },
    include: {
      company: true,
    },
  });
};

/**
 * Find the primary/default company membership record for a user.
 */
const findDefaultCompanyMemberForUser = async (userId, tx = prisma) => {
  return tx.companyMember.findFirst({
    where: { userId },
    include: {
      company: true,
    },
    orderBy: { createdAt: "asc" },
  });
};

module.exports = {
  createSupportRequest,
  findById,
  findByUserId,
  findByCompanyId,
  findAll,
  updateStatus,
  saveReply,
  findRecentDuplicate,
  findCompanyActiveAdmins,
  findCompanyMember,
  findDefaultCompanyMemberForUser,
};
