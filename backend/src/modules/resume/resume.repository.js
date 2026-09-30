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

async function ensureCandidateProfile(user, extractedData = {}, companyId = null, db = prisma) {
  if (!user || !user.email) return null;

  const email = user.email.trim().toLowerCase();
  const rawName = extractedData?.name || user.name || "";
  const parts = rawName.trim().split(" ");
  const fallbackFirstName = user.firstName ? user.firstName : "Candidate";
  const fallbackLastName = user.lastName ? user.lastName : "";
  const firstName = parts[0] || fallbackFirstName;
  const lastName = parts.slice(1).join(" ") || fallbackLastName;
  const phoneNumber = extractedData?.phone || null;
  const effectiveCompanyId = companyId || user.companyId || extractedData?.companyId || null;

  const skills = Array.isArray(extractedData?.skills) ? extractedData.skills : null;

  const existingCandidate = await db.candidateProfile.findUnique({
    where: { email },
    select: { firstName: true, lastName: true, metadata: true, companyId: true }
  });

  const existingMetadata = (existingCandidate && existingCandidate.metadata && typeof existingCandidate.metadata === 'object')
    ? existingCandidate.metadata
    : {};

  let finalSkills = existingMetadata.skills || [];
  if (Array.isArray(skills) && skills.length > 0) {
    // merge skills to preserve existing ones for search/filtering
    finalSkills = Array.from(new Set([...finalSkills, ...skills]));
  }

  const cleanExtracted = { ...extractedData };
  delete cleanExtracted.email;
  delete cleanExtracted.phone;
  delete cleanExtracted.name;
  delete cleanExtracted.companyId;
  delete cleanExtracted.skills;

  if (cleanExtracted.totalExperienceYears == null) {
    delete cleanExtracted.totalExperienceYears;
  }

  const oldExtractedSkills = existingMetadata.extractedSkills || existingMetadata.latestExtractedSkills;
  
  const updatedMetadata = {
    ...existingMetadata,
    ...cleanExtracted,
    skills: finalSkills,
    extractedSkills: Array.isArray(skills) && skills.length > 0 ? skills : (oldExtractedSkills || []),
  };

  delete updatedMetadata.latestExtractedSkills;

  const isExtractedNameValid = extractedData?.name && extractedData.name.trim().length > 0 && extractedData.name.trim().toLowerCase() !== "candidate";
  const hasExistingValidFirstName = existingCandidate?.firstName && existingCandidate.firstName !== "Candidate";
  const hasExistingValidLastName = existingCandidate?.lastName && existingCandidate.lastName.trim().length > 0;
  
  // Prefer existing valid names over newly extracted ones to prevent overwriting with uncertain parsed data
  const finalFirstName = hasExistingValidFirstName ? existingCandidate.firstName : (isExtractedNameValid ? firstName : fallbackFirstName);
  const finalLastName = hasExistingValidLastName ? existingCandidate.lastName : (isExtractedNameValid ? lastName : fallbackLastName);

  let companyIdToUpdate = undefined;
  if (existingCandidate) {
    if (!existingCandidate.companyId && effectiveCompanyId) {
      companyIdToUpdate = effectiveCompanyId;
    }
  }

  return db.candidateProfile.upsert({
    where: { email },
    update: {
      userId: user.id || undefined,
      firstName: finalFirstName,
      lastName: finalLastName,
      ...(phoneNumber && { phoneNumber }),
      ...(companyIdToUpdate && { companyId: companyIdToUpdate }),
      metadata: updatedMetadata,
    },
    create: {
      userId: user.id || null,
      companyId: effectiveCompanyId,
      email,
      firstName,
      lastName,
      phoneNumber,
      metadata: {
        ...cleanExtracted,
        skills: skills || [],
        extractedSkills: skills || [],
      },
    },
  });
}

async function createCandidate(data, db = prisma) {
  const user = await db.user.create({
    data,
  });

  await ensureCandidateProfile(user, {}, null, db);

  return user;
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

async function updateInboundEmailEvent(id, data, db = prisma) {
  return db.inboundEmailEvent.update({
    where: { id },
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

async function findInboundEmailEventsByMessageIds(
  provider,
  providerMessageIds,
  db = prisma
) {
  if (!providerMessageIds || providerMessageIds.length === 0) return [];
  return db.inboundEmailEvent.findMany({
    where: {
      provider,
      providerMessageId: { in: providerMessageIds },
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
    ensureCandidateProfile: (user, extractedData, companyId, tx) => ensureCandidateProfile(user, extractedData, companyId, tx || db),
    findJobApplication: (jobId, candidateId, tx) => findJobApplication(jobId, candidateId, tx || db),
    createJobApplication: (data, tx) => createJobApplication(data, tx || db),
    findJobApplicationById: (id, tx) => findJobApplicationById(id, tx || db),
    createInboundEmailEvent: (data, tx) => createInboundEmailEvent(data, tx || db),
    updateInboundEmailEvent: (id, data, tx) => updateInboundEmailEvent(id, data, tx || db),
    createInboundEmailEventSafely: (data, tx) => createInboundEmailEventSafely(data, tx || db),
    findInboundEmailEvent: (provider, msgId, tx) => findInboundEmailEvent(provider, msgId, tx || db),
    findInboundEmailEventsByMessageIds: (provider, msgIds, tx) => findInboundEmailEventsByMessageIds(provider, msgIds, tx || db),
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
  ensureCandidateProfile,
  findJobApplication,
  createJobApplication,
  findJobApplicationById,
  createInboundEmailEvent,
  updateInboundEmailEvent,
  createInboundEmailEventSafely,
  findInboundEmailEvent,
  findInboundEmailEventsByMessageIds,
  markInboundEmailEventCompleted,
  markInboundEmailEventFailed,
};

