"use strict";

const { prisma } = require("../../config/prisma");

async function findJobByInboundEmail(inboundEmail, db = prisma) {
  if (!inboundEmail) return null;

  return db.job.findFirst({
    where: {
      inboundEmail: inboundEmail.trim().toLowerCase(),
      deletedAt: null,
    },
  });
}

async function findJobByCode(code, db = prisma) {
  if (!code) return null;

  return db.job.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      deletedAt: null,
    },
  });
}

async function findResumeByHash(fileHash, db = prisma) {
  if (!fileHash) return null;

  return db.resumeProcessing.findUnique({
    where: {
      fileHash,
    },
    include: {
      applications: true,
    },
  });
}

async function createResumeProcessing(data, db = prisma) {
  return db.resumeProcessing.create({
    data,
  });
}

async function findResumeProcessingById(id, db = prisma) {
  if (!id) return null;

  return db.resumeProcessing.findUnique({
    where: { id },
    include: {
      applications: true,
    },
  });
}

async function updateResumeProcessing(id, data, db = prisma) {
  return db.resumeProcessing.update({
    where: { id },
    data,
  });
}

async function findCandidateByEmail(email, db = prisma) {
  if (!email) return null;

  return db.user.findUnique({
    where: {
      email: email.trim().toLowerCase(),
    },
  });
}

async function createCandidate(data, db = prisma) {
  return db.user.create({
    data,
  });
}

async function updateCandidate(id, data, db = prisma) {
  return db.user.update({
    where: { id },
    data,
  });
}

async function findJobApplication(jobId, candidateId, db = prisma) {
  if (!jobId || !candidateId) return null;

  return db.jobApplication.findUnique({
    where: {
      jobId_candidateId: {
        jobId,
        candidateId,
      },
    },
    include: {
      resumeProcessing: true,
    },
  });
}

async function createJobApplication(data, db = prisma) {
  return db.jobApplication.create({
    data,
    include: {
      job: true,
      candidate: true,
      resumeProcessing: true,
    },
  });
}

async function findJobApplicationById(id, db = prisma) {
  if (!id) return null;

  return db.jobApplication.findUnique({
    where: { id },
    include: {
      job: true,
      candidate: true,
      resumeProcessing: true,
    },
  });
}

async function createInboundEmailEvent(data, db = prisma) {
  return db.inboundEmailEvent.create({
    data,
  });
}

async function findInboundEmailEvent(
  provider,
  providerMessageId,
  db = prisma
) {
  return db.inboundEmailEvent.findUnique({
    where: {
      provider_providerMessageId: {
        provider,
        providerMessageId,
      },
    },
  });
}

async function markInboundEmailEventCompleted(
  id,
  resumeProcessingId,
  db = prisma
) {
  return db.inboundEmailEvent.update({
    where: { id },
    data: {
      status: "COMPLETED",
      resumeProcessingId,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
}

async function markInboundEmailEventFailed(
  id,
  errorCode,
  errorMessage,
  db = prisma
) {
  return db.inboundEmailEvent.update({
    where: { id },
    data: {
      status: "FAILED",
      errorCode,
      errorMessage,
    },
  });
}

async function createInboundEmailEventSafely(
  data,
  db = prisma
) {
  try {
    const existing = await findInboundEmailEvent(
      data.provider,
      data.providerMessageId,
      db
    );

    if (existing) {
      return existing;
    }

    return await db.inboundEmailEvent.create({
      data,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return await findInboundEmailEvent(
        data.provider,
        data.providerMessageId,
        db
      );
    }

    throw error;
  }
}

function createResumeRepository(options = {}) {
  const db = options.prisma || prisma;

  return {
    findJobByInboundEmail: (email, tx) => findJobByInboundEmail(email, tx || db),
    findJobByCode: (code, tx) => findJobByCode(code, tx || db),
    findResumeByHash: (hash, tx) => findResumeByHash(hash, tx || db),
    createResumeProcessing: (data, tx) => createResumeProcessing(data, tx || db),
    findResumeProcessingById: (id, tx) => findResumeProcessingById(id, tx || db),
    updateResumeProcessing: (id, data, tx) => updateResumeProcessing(id, data, tx || db),
    findCandidateByEmail: (email, tx) => findCandidateByEmail(email, tx || db),
    createCandidate: (data, tx) => createCandidate(data, tx || db),
    updateCandidate: (id, data, tx) => updateCandidate(id, data, tx || db),
    findJobApplication: (jobId, candidateId, tx) => findJobApplication(jobId, candidateId, tx || db),
    createJobApplication: (data, tx) => createJobApplication(data, tx || db),
    findJobApplicationById: (id, tx) => findJobApplicationById(id, tx || db),
    createInboundEmailEvent: (data, tx) => createInboundEmailEvent(data, tx || db),
    createInboundEmailEventSafely: (data, tx) => createInboundEmailEventSafely(data, tx || db),
    findInboundEmailEvent: (provider, msgId, tx) => findInboundEmailEvent(provider, msgId, tx || db),
    markInboundEmailEventCompleted: (id, resId, tx) => markInboundEmailEventCompleted(id, resId, tx || db),
    markInboundEmailEventFailed: (id, code, msg, tx) => markInboundEmailEventFailed(id, code, msg, tx || db),
  };
}

module.exports = {
  createResumeRepository,
  findJobByInboundEmail,
  findJobByCode,
  findResumeByHash,
  createResumeProcessing,
  findResumeProcessingById,
  updateResumeProcessing,
  findCandidateByEmail,
  createCandidate,
  updateCandidate,
  findJobApplication,
  createJobApplication,
  findJobApplicationById,
  createInboundEmailEvent,
  createInboundEmailEventSafely,
  findInboundEmailEvent,
  markInboundEmailEventCompleted,
  markInboundEmailEventFailed,
};

