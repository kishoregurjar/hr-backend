"use strict";

const { prisma } = require("../../config/prisma");

const findCompanyOwner = async (companyId, tx = prisma) => {
  return tx.companyMember.findFirst({
    where: {
      companyId,
      role: "OWNER",
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
};

const findCompanyById = async (companyId, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  });
};

const findOwnerActivation = async (userId, tx = prisma) => {
  return tx.companyOwnerActivation.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      consumedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

const revokeOwnerActivation = async (activationId, now = new Date(), tx = prisma) => {
  return tx.companyOwnerActivation.update({
    where: {
      id: activationId,
    },
    data: {
      status: "REVOKED",
      updatedAt: now,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      consumedAt: true,
      updatedAt: true,
    },
  });
};

module.exports = {
  findCompanyOwner,
  findCompanyById,
  findOwnerActivation,
  revokeOwnerActivation,
};
