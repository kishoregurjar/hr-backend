"use strict";

const { prisma } = require("../../config/prisma");

const createInvitation = async (data, tx = prisma) => {
  return tx.companyInvitation.create({
    data,
  });
};

const findInvitationById = async (invitationId, tx = prisma) => {
  return tx.companyInvitation.findUnique({
    where: {
      id: invitationId,
    },
  });
};

const findInvitationByTokenHash = async (tokenHash, tx = prisma) => {
  return tx.companyInvitation.findUnique({
    where: {
      tokenHash,
    },
  });
};

const findPendingInvitationByEmail = async (companyId, email, tx = prisma) => {
  return tx.companyInvitation.findFirst({
    where: {
      companyId,
      email,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

const findInvitationsByCompany = async (
  companyId,
  { status, skip = 0, take = 20 } = {},
  tx = prisma
) => {
  const where = {
    companyId,
  };

  if (status) {
    where.status = status;
  }

  return tx.companyInvitation.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take,
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

const countInvitationsByCompany = async (
  companyId,
  { status } = {},
  tx = prisma
) => {
  const where = {
    companyId,
  };

  if (status) {
    where.status = status;
  }

  return tx.companyInvitation.count({
    where,
  });
};

const countPendingInvitations = async (companyId, tx = prisma) => {
  return tx.companyInvitation.count({
    where: {
      companyId,
      status: "PENDING",
    },
  });
};

const markInvitationAccepted = async (invitationId, acceptedAt, tx = prisma) => {
  return tx.companyInvitation.update({
    where: {
      id: invitationId,
    },
    data: {
      status: "ACCEPTED",
      acceptedAt,
    },
  });
};

const markInvitationRevoked = async (invitationId, tx = prisma) => {
  return tx.companyInvitation.update({
    where: {
      id: invitationId,
    },
    data: {
      status: "REVOKED",
    },
  });
};

const markInvitationExpired = async (invitationId, tx = prisma) => {
  return tx.companyInvitation.update({
    where: {
      id: invitationId,
    },
    data: {
      status: "EXPIRED",
    },
  });
};

const expirePendingInvitations = async (
  companyId,
  now = new Date(),
  tx = prisma
) => {
  return tx.companyInvitation.updateMany({
    where: {
      companyId,
      status: "PENDING",
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });
};

const deleteInvitation = async (invitationId, tx = prisma) => {
  return tx.companyInvitation.delete({
    where: {
      id: invitationId,
    },
  });
};

const findInvitationIdsByCompany = async (companyId, tx = prisma) => {
  const invitations = await tx.companyInvitation.findMany({
    where: {
      companyId,
    },
    select: {
      id: true,
    },
  });

  return invitations.map((invitation) => invitation.id);
};

module.exports = {
  createInvitation,
  findInvitationById,
  findInvitationByTokenHash,
  findPendingInvitationByEmail,
  findInvitationsByCompany,
  countInvitationsByCompany,
  countPendingInvitations,
  markInvitationAccepted,
  markInvitationRevoked,
  markInvitationExpired,
  expirePendingInvitations,
  deleteInvitation,
  findInvitationIdsByCompany,
};

