"use strict";

const { parseResume } = require("./resume.parser.service");
const { validateResumeFile } = require("./resume.validator");
const { RESUME_SOURCE } = require("./resume.constants");

function createResumeService({ repository }) {
  if (!repository) {
    throw new Error("RESUME_REPOSITORY_REQUIRED");
  }

  async function parseUploadedResume({ file }) {
    validateResumeFile(file);

    const parsed = await parseResume({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });

    return {
      source: RESUME_SOURCE.UPLOAD,
      ...parsed,
    };
  }

  async function processUploadedResume({ file, jobId = null, candidateId = null }) {
    const parsed = await parseUploadedResume({ file });

    const existingByHash = await repository.findResumeByHash(parsed.fileHash);

    if (existingByHash) {
      const error = new Error("RESUME_DUPLICATE");
      error.statusCode = 409;
      error.code = "RESUME_DUPLICATE";
      throw error;
    }

    let candidate = null;

    if (candidateId) {
      candidate = await repository.findCandidateById(candidateId);
    }

    if (!candidate && parsed.candidate.email) {
      candidate = await repository.findCandidateByEmail(parsed.candidate.email);
    }

    if (!candidate) {
      candidate = await repository.createCandidateWithResume({
        parsed,
        jobId,
      });
    } else {
      candidate = await repository.updateCandidateWithResume({
        candidate,
        parsed,
        jobId,
      });
    }

    let application = null;

    if (jobId) {
      application = await repository.createJobApplication({
        jobId,
        candidateId: candidate.id,
        resumeHash: parsed.fileHash,
      });
    }

    return {
      candidate,
      application,
      parsed,
    };
  }

  return Object.freeze({
    parseUploadedResume,
    processUploadedResume,
  });
}

module.exports = {
  createResumeService,
};
