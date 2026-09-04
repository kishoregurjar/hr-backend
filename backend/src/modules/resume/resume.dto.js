"use strict";

function toResumeCandidateDto(candidate) {
  if (!candidate) {
    return null;
  }

  return {
    name: candidate.name || null,
    email: candidate.email || null,
    phone: candidate.phone || null,
    skills: Array.isArray(candidate.skills) ? [...candidate.skills] : [],
    totalExperienceYears: candidate.totalExperienceYears ?? null,
  };
}

function toResumeParseDto(result) {
  return {
    fileHash: result.fileHash,
    candidate: toResumeCandidateDto(result.candidate),
  };
}

function toResumeProcessingDto(entity) {
  if (!entity) {
    return null;
  }

  return {
    id: entity.id,
    status: entity.status,
    source: entity.source,
    candidate: entity.candidate ? toResumeCandidateDto(entity.candidate) : null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

module.exports = {
  toResumeCandidateDto,
  toResumeParseDto,
  toResumeProcessingDto,
};
