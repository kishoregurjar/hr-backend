"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const repository = require("./resume.repository");
const parserService = require("./resume.parser.service");
const constants = require("./resume.constants");
const {
  buildCandidateCreateData,
  buildResumeProcessingCreateData,
  buildResumeProcessingCompletedData,
  buildResumeProcessingReviewRequiredData,
  buildResumeProcessingFailedData,
  normalizeEmail,
  toResumeProcessingDto,
  toJobApplicationDto,
} = require("./resume.mapper");

const { prisma } = require("../../config/prisma");

function createApplicationError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function calculateSha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function generateTemporaryPassword() {
  return crypto.randomBytes(32).toString("base64url");
}

function sanitizeProcessingError(error) {
  if (!error) {
    return {
      code: "RESUME_PROCESSING_FAILED",
      message: "Resume processing failed",
    };
  }

  const allowedCodes = new Set([
    "RESUME_PARSE_FAILED",
    "UNSUPPORTED_FILE_TYPE",
    "INVALID_FILE_SIGNATURE",
    "PDF_TEXT_EXTRACTION_FAILED",
    "DOCX_TEXT_EXTRACTION_FAILED",
    "CANDIDATE_EMAIL_NOT_FOUND",
    "RESUME_REVIEW_REQUIRED",
  ]);

  const code = allowedCodes.has(error.code)
    ? error.code
    : "RESUME_PROCESSING_FAILED";

  return {
    code,
    message:
      code === "RESUME_REVIEW_REQUIRED"
        ? "Resume requires manual review"
        : "Resume processing failed",
  };
}

function validateUploadedFile(file) {
  if (!file) {
    throw createApplicationError(
      "RESUME_FILE_REQUIRED",
      "Resume file is required",
      400
    );
  }

  if (!Buffer.isBuffer(file.buffer)) {
    throw createApplicationError(
      "RESUME_FILE_BUFFER_REQUIRED",
      "Resume file buffer is required",
      400
    );
  }

  if (!file.buffer.length) {
    throw createApplicationError(
      "RESUME_FILE_EMPTY",
      "Resume file is empty",
      400
    );
  }

  if (
    file.buffer.length >
    (constants.MAX_RESUME_FILE_SIZE || constants.MAX_RESUME_SIZE_BYTES)
  ) {
    throw createApplicationError(
      "RESUME_FILE_TOO_LARGE",
      "Resume file exceeds the maximum allowed size",
      413
    );
  }
}

function getFileType(file) {
  const extension = String(file.originalname || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (extension === "pdf") {
    return "PDF";
  }

  if (extension === "docx") {
    return "DOCX";
  }

  throw createApplicationError(
    "UNSUPPORTED_FILE_TYPE",
    "Only PDF and DOCX resumes are supported",
    415
  );
}

function validateFileSignature(
  buffer,
  fileType
) {
  if (!Buffer.isBuffer(buffer)) {
    throw createApplicationError(
      "INVALID_FILE_SIGNATURE",
      "Invalid resume file",
      400
    );
  }

  if (fileType === "PDF") {
    const pdfSignature =
      Buffer.from("%PDF-");

    if (
      buffer.length < pdfSignature.length ||
      !buffer.subarray(
        0,
        pdfSignature.length
      ).equals(pdfSignature)
    ) {
      throw createApplicationError(
        "INVALID_FILE_SIGNATURE",
        "Invalid PDF file",
        415
      );
    }

    return true;
  }

  if (fileType === "DOCX") {
    /*
     * DOCX is a ZIP container.
     *
     * PK\x03\x04 is the standard local file
     * header expected for normal DOCX archives.
     */
    const zipSignature =
      Buffer.from([
        0x50,
        0x4b,
        0x03,
        0x04,
      ]);

    if (
      buffer.length < zipSignature.length ||
      !buffer
        .subarray(
          0,
          zipSignature.length
        )
        .equals(zipSignature)
    ) {
      throw createApplicationError(
        "INVALID_FILE_SIGNATURE",
        "Invalid DOCX file",
        415
      );
    }

    return true;
  }

  throw createApplicationError(
    "UNSUPPORTED_FILE_TYPE",
    "Unsupported resume file type",
    415
  );
}

function buildStorageKey({ fileHash, fileType }) {
  const extension = fileType === "PDF" ? "pdf" : "docx";

  return `resumes/${fileHash.slice(0, 2)}/${fileHash}.${extension}`;
}

async function createCandidateIfRequired({ extractedData, tx }) {
  const email = normalizeEmail(extractedData?.email);

  if (!email) {
    throw createApplicationError(
      "CANDIDATE_EMAIL_NOT_FOUND",
      "Candidate email could not be extracted from resume",
      422
    );
  }

  const existingCandidate = await repository.findCandidateByEmail(email, tx);

  if (existingCandidate) {
    if (existingCandidate.role !== "CANDIDATE") {
      throw createApplicationError(
        "CANDIDATE_EMAIL_CONFLICT",
        "Resume email belongs to a non-candidate account",
        409
      );
    }

    return {
      candidate: existingCandidate,
      created: false,
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const candidateData = buildCandidateCreateData({
    extractedData,
    passwordHash,
  });

  try {
    const candidate = await repository.createCandidate(candidateData, tx);

    return {
      candidate,
      created: true,
    };
  } catch (error) {
    if (error?.code === "P2002") {
      const concurrentCandidate = await repository.findCandidateByEmail(
        email,
        tx
      );

      if (concurrentCandidate) {
        return {
          candidate: concurrentCandidate,
          created: false,
        };
      }
    }

    throw error;
  }
}

async function resolveInboundJob({
  inboundEmail,
  subjectCode,
  repository: customRepo = repository,
}) {
  if (inboundEmail) {
    const job = await customRepo.findJobByInboundEmail(inboundEmail);

    if (job) {
      return job;
    }
  }

  if (subjectCode) {
    const job = await customRepo.findJobByCode(subjectCode);

    if (job) {
      return job;
    }
  }

  return null;
}

async function resolveDirectUploadJob({ jobId, tx }) {
  if (!jobId) {
    return null;
  }

  if (tx) {
    const job = await tx.job.findFirst({
      where: {
        id: jobId,
        deletedAt: null,
      },
    });

    if (!job) {
      throw createApplicationError(
        "JOB_NOT_FOUND",
        "Specified job was not found",
        404
      );
    }

    return job;
  }

  return null;
}

async function resolveJob({ jobId, inboundEmail, subjectCode, source, tx }) {
  if (source === "INBOUND_EMAIL") {
    return resolveInboundJob({
      inboundEmail,
      subjectCode,
      repository: tx ? {
        findJobByInboundEmail: (email) => repository.findJobByInboundEmail(email, tx),
        findJobByCode: (code) => repository.findJobByCode(code, tx),
      } : repository,
    });
  }

  return resolveDirectUploadJob({
    jobId,
    tx,
  });
}

async function createApplicationIfRequired({
  job,
  candidate,
  resumeProcessingId,
  source,
  extractedData,
  tx,
}) {
  if (!job) {
    return null;
  }

  const existingApplication = await repository.findJobApplication(
    job.id,
    candidate.id,
    tx
  );

  if (existingApplication) {
    throw createApplicationError(
      "JOB_APPLICATION_ALREADY_EXISTS",
      "Candidate has already applied to this job",
      409
    );
  }

  try {
    return await repository.createJobApplication(
      {
        jobId: job.id,
        candidateId: candidate.id,
        candidateEmail: candidate.email,
        candidateName:
          extractedData?.name ||
          `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim(),
        resumeProcessingId,
        source,
        status: "APPLIED",
      },
      tx
    );
  } catch (error) {
    if (error?.code === "P2002") {
      throw createApplicationError(
        "JOB_APPLICATION_ALREADY_EXISTS",
        "Candidate has already applied to this job",
        409
      );
    }

    throw error;
  }
}

const defaultInMemoryStorageService = {
  async putObject({ key, body, contentType, contentLength }) {
    return { key, etag: calculateSha256(body) };
  },
};

async function processResume({
  file,
  source = "DIRECT_UPLOAD",
  jobId = null,
  inboundEmail = null,
  subjectCode = null,
  storageService = defaultInMemoryStorageService,
  uploadedByUserId = null,
}) {
  validateUploadedFile(file);

  if (source !== "DIRECT_UPLOAD" && source !== "INBOUND_EMAIL") {
    throw createApplicationError(
      "INVALID_RESUME_SOURCE",
      "Invalid resume processing source",
      400
    );
  }

  const isInbound = source === "INBOUND_EMAIL";
  let effectiveUploadedByUserId = uploadedByUserId;

  if (isInbound) {
    /*
     * Direct-upload user permissions do not apply here.
     * The webhook has already passed provider authentication.
     */
    effectiveUploadedByUserId = null;
  }

  const effectiveStorage = storageService || defaultInMemoryStorageService;

  if (!effectiveStorage || typeof effectiveStorage.putObject !== "function") {
    throw createApplicationError(
      "RESUME_STORAGE_UNAVAILABLE",
      "Resume storage service is not configured",
      500
    );
  }

  const fileType = getFileType(file);
  validateFileSignature(file.buffer, fileType);
  const fileHash = calculateSha256(file.buffer);

  const existingResume = await repository.findResumeByHash(fileHash);

  if (existingResume) {
    const appDto = Array.isArray(existingResume.applications) && existingResume.applications.length > 0
      ? toJobApplicationDto(existingResume.applications[0])
      : toJobApplicationDto(existingResume.application);

    return {
      duplicate: true,
      candidateId: existingResume.candidateId || null,
      resumeProcessing: toResumeProcessingDto(existingResume),
      application: appDto,
    };
  }

  const storageKey = buildStorageKey({
    fileHash,
    fileType,
  });

  const resumeProcessing = await repository.createResumeProcessing(
    buildResumeProcessingCreateData({
      source,
      fileType,
      fileName: file.originalname || "resume.pdf",
      mimeType: file.mimetype || "application/pdf",
      fileSize: file.buffer.length,
      fileHash,
      storageKey,
      parserVersion: constants.PARSER_VERSION || "1.0.0",
    })
  );

  try {
    await effectiveStorage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype || "application/pdf",
      contentLength: file.buffer.length,
    });

    await repository.updateResumeProcessing(resumeProcessing.id, {
      status: "PROCESSING",
    });

    let parsed;

    try {
      parsed = await parserService.parseResume({
        buffer: file.buffer,
        fileType,
        fileName: file.originalname,
      });
    } catch (error) {
      const sanitized = sanitizeProcessingError(error);

      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingFailedData({
          errorCode: sanitized.code,
          errorMessage: sanitized.message,
        })
      );

      throw error;
    }

    if (parsed?.status === "REVIEW_REQUIRED") {
      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingReviewRequiredData({
          extractedData: parsed.extractedData || null,
          confidenceScore: parsed.confidenceScore || null,
          errorCode: parsed.errorCode || "RESUME_REVIEW_REQUIRED",
          errorMessage: "Resume requires manual review",
        })
      );

      return {
        duplicate: false,
        resumeProcessing: toResumeProcessingDto(
          await repository.findResumeProcessingById(resumeProcessing.id)
        ),
        application: null,
      };
    }

    const extractedData = parsed.extractedData || parsed.candidate || {};

    const result = await prisma.$transaction(async (tx) => {
      const candidateResult = await createCandidateIfRequired({
        extractedData,
        tx,
      });

      const job = isInbound
        ? await resolveInboundJob({
            inboundEmail,
            subjectCode,
            repository: {
              findJobByInboundEmail: (email) => repository.findJobByInboundEmail(email, tx),
              findJobByCode: (code) => repository.findJobByCode(code, tx),
            },
          })
        : await resolveDirectUploadJob({
            jobId,
            tx,
          });


      const application = await createApplicationIfRequired({
        job,
        candidate: candidateResult.candidate,
        resumeProcessingId: resumeProcessing.id,
        source,
        extractedData,
        tx,
      });

      const targetStatus = (!job && isInbound)
        ? buildResumeProcessingReviewRequiredData({
            candidateId: candidateResult.candidate.id,
            extractedData,
            confidenceScore: parsed.confidenceScore || null,
            errorCode: "JOB_NOT_RESOLVED",
            errorMessage: "Inbound email job could not be automatically resolved",
          })
        : buildResumeProcessingCompletedData({
            candidateId: candidateResult.candidate.id,
            extractedData,
            confidenceScore: parsed.confidenceScore || null,
          });

      const completedResume = await repository.updateResumeProcessing(
        resumeProcessing.id,
        targetStatus,
        tx
      );

      return {
        candidate: candidateResult.candidate,
        application,
        resumeProcessing: completedResume,
      };
    });


    return {
      duplicate: false,
      candidateId: result.candidate.id,
      resumeProcessing: toResumeProcessingDto(result.resumeProcessing),
      application: toJobApplicationDto(result.application),
    };
  } catch (error) {
    const existing = await repository.findResumeProcessingById(
      resumeProcessing.id
    );

    if (
      existing &&
      existing.status !== "FAILED" &&
      existing.status !== "COMPLETED" &&
      existing.status !== "REVIEW_REQUIRED"
    ) {
      const sanitized = sanitizeProcessingError(error);

      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingFailedData({
          errorCode: sanitized.code,
          errorMessage: sanitized.message,
        })
      );
    }

    throw error;
  }
}

async function getResumeProcessingById(
  id,
  { user = null } = {}
) {
  if (!id) {
    throw createApplicationError(
      "RESUME_PROCESSING_ID_REQUIRED",
      "Resume processing id is required",
      400
    );
  }

  const resume =
    await repository.findResumeProcessingById(
      id
    );

  if (!resume) {
    throw createApplicationError(
      "RESUME_PROCESSING_NOT_FOUND",
      "Resume processing record was not found",
      404
    );
  }

  /*
   * Candidate can access only their own resume.
   * HR/SUPER_ADMIN access is handled here as defense-in-depth.
   */
  if (user) {
    const role = user.role;

    const privileged =
      role === "HR" ||
      role === "SUPER_ADMIN";

    if (!privileged) {
      if (
        role !== "CANDIDATE" ||
        resume.candidateId !== user.id
      ) {
        throw createApplicationError(
          "RESUME_ACCESS_DENIED",
          "You are not allowed to access this resume",
          403
        );
      }
    }
  }

  return toResumeProcessingDto(resume);
}

function createResumeService(options = {}) {
  return {
    processResume: (payload) => processResume({ ...payload, ...options }),
    getResumeProcessingById: (id, opts) => getResumeProcessingById(id, opts),
  };
}

module.exports = {
  processResume,
  getResumeProcessingById,
  createResumeService,
  calculateSha256,
  validateUploadedFile,
  validateFileSignature,
  getFileType,
  buildStorageKey,
  resolveInboundJob,
  resolveDirectUploadJob,
};


