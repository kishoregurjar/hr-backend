"use strict";

function normalizeEmail(email) {
  if (!email || typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();

  return normalized || null;
}

function normalizeName(name) {
  if (!name || typeof name !== "string") {
    return null;
  }

  const normalized = name
    .trim()
    .replace(/\s+/g, " ");

  return normalized || null;
}

function splitName(fullName) {
  const normalized = normalizeName(fullName);

  if (!normalized) {
    return {
      firstName: "Candidate",
      lastName: "",
    };
  }

  const parts = normalized.split(" ");

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts.shift(),
    lastName: parts.join(" "),
  };
}

function buildCandidateCreateData({
  extractedData,
  passwordHash,
}) {
  const email = normalizeEmail(extractedData?.email);

  if (!email) {
    const error = new Error("Candidate email could not be extracted");
    error.code = "CANDIDATE_EMAIL_NOT_FOUND";
    error.statusCode = 422;
    throw error;
  }

  const { firstName, lastName } = splitName(
    extractedData?.name
  );

  return {
    email,
    password: passwordHash,
    firstName,
    lastName,
    role: "CANDIDATE",
    emailVerified: false,
    isActive: true,
  };
}

function buildResumeProcessingCreateData({
  source,
  fileType,
  fileName,
  mimeType,
  fileSize,
  fileHash,
  storageKey,
  parserVersion,
}) {
  return {
    source,
    status: "PENDING",
    fileType,
    fileName,
    mimeType,
    fileSize,
    fileHash,
    storageKey,
    parserVersion,
  };
}

function buildResumeProcessingCompletedData({
  candidateId,
  extractedData,
  confidenceScore,
}) {
  return {
    candidateId,
    status: "COMPLETED",
    extractedData,
    confidenceScore,
    processedAt: new Date(),
    errorCode: null,
    errorMessage: null,
  };
}

function buildResumeProcessingReviewRequiredData({
  candidateId,
  extractedData,
  confidenceScore,
  errorCode,
  errorMessage,
}) {
  return {
    candidateId: candidateId || null,
    status: "REVIEW_REQUIRED",
    extractedData: extractedData || null,
    confidenceScore:
      typeof confidenceScore === "number"
        ? confidenceScore
        : null,
    errorCode,
    errorMessage,
  };
}

function buildResumeProcessingFailedData({
  errorCode,
  errorMessage,
}) {
  return {
    status: "FAILED",
    errorCode,
    errorMessage,
    processedAt: new Date(),
  };
}

function toResumeProcessingDto(resume) {
  if (!resume) {
    return null;
  }

  return {
    id: resume.id,
    status: resume.status,
    source: resume.source,
    fileType: resume.fileType,
    fileName: resume.fileName,
    fileSize: resume.fileSize,
    confidenceScore: resume.confidenceScore,
    candidateId: resume.candidateId,
    processedAt: resume.processedAt,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

function toJobApplicationDto(application) {
  if (!application) {
    return null;
  }

  return {
    id: application.id,
    jobId: application.jobId,
    candidateId: application.candidateId,
    candidateName: application.candidateName,
    source: application.source,
    status: application.status,
    appliedAt: application.appliedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

module.exports = {
  normalizeEmail,
  normalizeName,
  splitName,
  buildCandidateCreateData,
  buildResumeProcessingCreateData,
  buildResumeProcessingCompletedData,
  buildResumeProcessingReviewRequiredData,
  buildResumeProcessingFailedData,
  toResumeProcessingDto,
  toJobApplicationDto,
};
