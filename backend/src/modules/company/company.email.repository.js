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

module.exports = {
  createEmailDelivery,
  findEmailDeliveryByInvitationId,
  markEmailProcessing,
  markEmailSent,
  markEmailFailed,
};
