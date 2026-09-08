"use strict";

/**
 * Resume DTO
 * Sanitizes domain entities into candidate-safe, recruiter-safe API responses.
 */

function toResumeCandidateDto(candidate) {
  if (!candidate) {
    return null;
  }

  return {
    id: candidate.id || null,
    name: candidate.name || null,
    email: candidate.email || null,
    role: candidate.role || "CANDIDATE",
  };
}

function toResumeJobDto(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    title: job.title,
    code: job.code,
    status: job.status,
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
    candidateEmail: application.candidateEmail,
    candidateName: application.candidateName,
    source: application.source,
    status: application.status,
    appliedAt: application.appliedAt,
    job: toResumeJobDto(application.job),
  };
}

function toResumeProcessingDto(processing) {
  if (!processing) {
    return null;
  }

  const extracted = processing.extractedData && typeof processing.extractedData === "object"
    ? processing.extractedData
    : {};

  return {
    id: processing.id,
    status: processing.status,
    source: processing.source,
    fileType: processing.fileType,
    fileName: processing.fileName,
    fileSize: processing.fileSize,
    confidenceScore: processing.confidenceScore ?? null,
    candidate: toResumeCandidateDto(processing.candidate),
    parsedSkills: Array.isArray(extracted.skills) ? extracted.skills : [],
    totalExperienceYears: extracted.experienceYears ?? null,
    application: Array.isArray(processing.applications) && processing.applications.length > 0
      ? toJobApplicationDto(processing.applications[0])
      : null,
    processedAt: processing.processedAt || null,
    createdAt: processing.createdAt,
  };
}

module.exports = {
  toResumeCandidateDto,
  toResumeJobDto,
  toJobApplicationDto,
  toResumeProcessingDto,
};
