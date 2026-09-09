"use strict";

const { prisma } = require("../../config/prisma");

const createActivation = async (data, tx = prisma) => {
  return tx.companyOwnerActivation.create({
    data,
  });
};

const findByTokenHash = async (tokenHash, tx = prisma) => {
  return tx.companyOwnerActivation.findUnique({
    where: {
      tokenHash,
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
  });
};

const findByUserId = async (userId, tx = prisma) => {
  return tx.companyOwnerActivation.findUnique({
    where: {
      userId,
    },
  });
};

const markConsumed = async (activationId, consumedAt, tx = prisma) => {
  return tx.companyOwnerActivation.update({
    where: {
      id: activationId,
    },
    data: {
      status: "CONSUMED",
      consumedAt,
    },
  });
};

const markExpired = async (activationId, tx = prisma) => {
  return tx.companyOwnerActivation.update({
    where: {
      id: activationId,
    },
    data: {
      status: "EXPIRED",
    },
  });
};

const revokeByUserId = async (userId, tx = prisma) => {
  return tx.companyOwnerActivation.updateMany({
    where: {
      userId,
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
    },
  });
};

const findByActivationId = async (activationId, tx = prisma) => {
  return tx.companyOwnerActivation.findUnique({
    where: {
      id: activationId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          companyMembers: {
            where: {
              role: "OWNER",
            },
            take: 1,
            select: {
              company: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

const rotateActivation = async (
  activationId,
  { tokenHash, encryptedToken, expiresAt },
  tx = prisma
) => {
  return tx.companyOwnerActivation.update({
    where: {
      id: activationId,
    },
    data: {
      tokenHash,
      encryptedToken,
      status: "PENDING",
      expiresAt,
      consumedAt: null,
    },
  });
};

module.exports = {
  createActivation,
  findByTokenHash,
  findByUserId,
  findByActivationId,
  rotateActivation,
  markConsumed,
  markExpired,
  revokeByUserId,
};
