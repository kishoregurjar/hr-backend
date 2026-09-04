"use strict";

function createResumeRepository({ prisma }) {
  if (!prisma) {
    throw new Error("PRISMA_CLIENT_REQUIRED");
  }

  async function findCandidateByEmail(email) {
    if (!email) {
      return null;
    }

    return prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });
  }

  async function findCandidateById(candidateId) {
    return prisma.user.findUnique({
      where: {
        id: candidateId,
      },
    });
  }

  async function findResumeByHash(fileHash) {
    if (!fileHash) {
      return null;
    }
    return null;
  }

  async function createCandidateWithResume(_data) {
    throw new Error("RESUME_PERSISTENCE_SCHEMA_REQUIRED");
  }

  async function updateCandidateWithResume(_data) {
    throw new Error("RESUME_PERSISTENCE_SCHEMA_REQUIRED");
  }

  async function createJobApplication(_data) {
    throw new Error("JOB_APPLICATION_SCHEMA_REQUIRED");
  }

  return Object.freeze({
    findCandidateByEmail,
    findCandidateById,
    findResumeByHash,
    createCandidateWithResume,
    updateCandidateWithResume,
    createJobApplication,
  });
}

module.exports = {
  createResumeRepository,
};
