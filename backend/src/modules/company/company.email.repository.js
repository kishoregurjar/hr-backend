"use strict";

const { prisma } = require("../../config/prisma");

const createEmailDelivery = async (data, tx = prisma) => {
  return tx.emailDelivery.create({
    data,
  });
};

const findEmailDeliveryByInvitationId = async (
  invitationId,
  tx = prisma
) => {
  return tx.emailDelivery.findUnique({
    where: {
      invitationId,
    },
  });
};

const markEmailProcessing = async (id, attempts, tx = prisma) => {
  return tx.emailDelivery.update({
    where: {
      id,
    },
    data: {
      status: "PROCESSING",
      attempts,
      lastError: null,
    },
  });
};

const markEmailSent = async (id, tx = prisma) => {
  return tx.emailDelivery.update({
    where: {
      id,
    },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lastError: null,
    },
  });
};

const markEmailFailed = async (id, errorMessage, tx = prisma) => {
  return tx.emailDelivery.update({
    where: {
      id,
    },
    data: {
      status: "FAILED",
      lastError: errorMessage,
    },
  });
};

const findEmailDeliveryByActivationId = async (
  activationId,
  tx = prisma
) => {
  return tx.emailDelivery.findUnique({
    where: {
      activationId,
    },
  });
};

const resetForRetry = async (id, tx = prisma) => {
  return tx.emailDelivery.update({
    where: {
      id,
    },
    data: {
      status: "PENDING",
      sentAt: null,
      lastError: null,
    },
  });
};

const resetStaleProcessingDeliveries = async ({
  staleMinutes = 10,
} = {}) => {
  return prisma.emailDelivery.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: {
        lt: new Date(Date.now() - staleMinutes * 60 * 1000),
      },
    },
    data: {
      status: "PENDING",
    },
  });
};

module.exports = {
  createEmailDelivery,
  findEmailDeliveryByInvitationId,
  findEmailDeliveryByActivationId,
  findByInvitationId: findEmailDeliveryByInvitationId,
  findByActivationId: findEmailDeliveryByActivationId,
  markEmailProcessing,
  markProcessing: markEmailProcessing,
  markEmailSent,
  markSent: markEmailSent,
  markEmailFailed,
  markFailed: markEmailFailed,
  resetForRetry,
  resetStaleProcessingDeliveries,
};
