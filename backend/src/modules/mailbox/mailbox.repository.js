"use strict";

const { prisma } = require("../../config/prisma");

async function findMailboxByUserId(userId, db = prisma) {
  if (!userId) return null;

  return db.userMailbox.findUnique({
    where: { userId },
  });
}

async function findActiveMailboxes(db = prisma) {
  return db.userMailbox.findMany({
    where: {
      isSyncActive: true,
    },
  });
}

async function upsertUserMailbox(
  { userId, email, refreshToken, accessToken, tokenExpiresAt, provider = "GOOGLE" },
  db = prisma
) {
  return db.userMailbox.upsert({
    where: { userId },
    create: {
      userId,
      provider,
      email,
      refreshToken,
      accessToken,
      tokenExpiresAt,
      isSyncActive: true,
    },
    update: {
      email,
      refreshToken,
      accessToken,
      tokenExpiresAt,
      isSyncActive: true,
      lastError: null,
    },
  });
}

async function updateMailboxSyncStatus(userId, { lastSyncedAt, lastError }, db = prisma) {
  return db.userMailbox.update({
    where: { userId },
    data: {
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
    },
  });
}

async function deleteUserMailbox(userId, db = prisma) {
  return db.userMailbox.delete({
    where: { userId },
  });
}

module.exports = {
  findMailboxByUserId,
  findActiveMailboxes,
  upsertUserMailbox,
  updateMailboxSyncStatus,
  deleteUserMailbox,
};
