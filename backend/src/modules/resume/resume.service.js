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

const {
  RESUME_ERROR_CODES,
  RESUME_PROCESSING_SOURCES,
} = require("./resume.constants");

const socketService = require("../../socket/socket.service");

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
    "CANDIDATE_EMAIL_CONFLICT",
    "RESUME_REVIEW_REQUIRED",
    "NOT_A_RESUME",
    "NOT_A_TECH_RESUME",
  ]);

  const code = allowedCodes.has(error.code)
    ? error.code
    : "RESUME_PROCESSING_FAILED";

  let message = "Resume processing failed";
  if (code === "RESUME_REVIEW_REQUIRED") {
    message = "Resume requires manual review";
  } else if (code === "CANDIDATE_EMAIL_CONFLICT") {
    message = error.message || "Resume email belongs to a non-candidate account";
  } else if (error.message && code !== "RESUME_PROCESSING_FAILED") {
    message = error.message;
  }

  return {
    code,
    message,
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

  if (extension === "doc") {
    return "DOC";
  }

  throw createApplicationError(
    "UNSUPPORTED_FILE_TYPE",
    "Only PDF, DOCX, and DOC resumes are supported",
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

  if (fileType === "DOC") {
    const docSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (
      buffer.length < docSignature.length ||
      !buffer.subarray(0, docSignature.length).equals(docSignature)
    ) {
      throw createApplicationError(
        "INVALID_FILE_SIGNATURE",
        "Invalid DOC file",
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
  const extension = fileType === "PDF" ? "pdf" : (fileType === "DOCX" ? "docx" : "doc");

  return `resumes/${fileHash.slice(0, 2)}/${fileHash}.${extension}`;
}

const candidateLocks = new Map();

async function withCandidateLock(email, fn) {
  if (!email) return fn();
  const key = String(email).trim().toLowerCase();
  while (candidateLocks.has(key)) {
    try {
      await candidateLocks.get(key);
    } catch (_) {}
  }
  let resolveLock;
  const lockPromise = new Promise((resolve) => {
    resolveLock = resolve;
  });
  candidateLocks.set(key, lockPromise);
  try {
    return await fn();
  } finally {
    candidateLocks.delete(key);
    resolveLock();
  }
}

async function createCandidateIfRequired({
  extractedData,
  sourceEmail = null,
  fallbackEmail = null,
  isForwarded = false,
  tx,
  companyId = null,
  source = null,
  emailSubject = null,
  emailBody = null
}) {
  const extractedEmailValid = normalizeEmail(extractedData?.email);
  const sourceEmailValid = normalizeEmail(sourceEmail);
  const fallbackEmailValid = normalizeEmail(fallbackEmail);

  let email = null;
  if (source === "DIRECT_UPLOAD") {
    // Direct upload by HR/SuperAdmin: resume email takes precedence
    email = extractedEmailValid || fallbackEmailValid;
  } else if (source === "INBOUND_EMAIL") {
    if (isForwarded) {
      // Forwarded: only use candidate email if reliably extracted from forward block (sourceEmailValid).
      // Never use the recruiter/outer sender address. Otherwise, fall back to extracted resume email.
      email = sourceEmailValid || extractedEmailValid;
    } else {
      // Direct candidate submission: candidate's actual sending email takes precedence.
      // Exception: If sender is a staff member of the target company or a SUPER_ADMIN,
      // and the resume contains an extracted candidate email different from sender,
      // the sender is submitting/forwarding on behalf of a candidate. Honor the candidate email.
      let isStaffSender = false;
      if (sourceEmailValid && extractedEmailValid && sourceEmailValid !== extractedEmailValid) {
        try {
          const senderUser = await repository.findCandidateByEmail(sourceEmailValid, tx || prisma);
          if (senderUser) {
            if (senderUser.role === "SUPER_ADMIN") {
              isStaffSender = true;
            } else if (companyId && Array.isArray(senderUser.companyMembers)) {
              isStaffSender = senderUser.companyMembers.some((m) => m.companyId === companyId);
            }
          }
        } catch (_) {}
      }

      if (isStaffSender) {
        email = extractedEmailValid;
      } else {
        email = sourceEmailValid || extractedEmailValid || fallbackEmailValid;
      }
    }
  } else {
    email = sourceEmailValid || extractedEmailValid || fallbackEmailValid;
  }

  if (!email) {
    throw createApplicationError(
      "CANDIDATE_EMAIL_NOT_FOUND",
      "Candidate email could not be extracted from resume",
      422
    );
  }

  const isFallback = !extractedEmailValid && !!normalizeEmail(fallbackEmail || sourceEmail);
  const safeExtractedData = { ...(extractedData || {}) };
  if (isFallback) {
    safeExtractedData.email = email;
  }
  // Preserve resume-extracted email in metadata if it differs from authoritative contact email
  if (extractedEmailValid && extractedEmailValid !== email) {
    safeExtractedData.resumeExtractedEmail = extractedEmailValid;
  }
  if (source === "INBOUND_EMAIL") {
    safeExtractedData.source = "EMAIL_EXTRACTION";
    if (emailSubject) safeExtractedData.emailSubject = emailSubject;
    if (emailBody) safeExtractedData.emailBody = emailBody;
  }

  return await withCandidateLock(email, async () => {
    const db = tx || prisma;
    const existingCandidate = await repository.findCandidateByEmail(email, db);

    if (existingCandidate) {
      if (existingCandidate.role === "SUPER_ADMIN") {
        throw createApplicationError(
          "CANDIDATE_EMAIL_CONFLICT",
          "Resume email belongs to a non-candidate account",
          409
        );
      }

      let isTargetCompanyMember = false;
      if (companyId) {
        if (Array.isArray(existingCandidate.companyMembers)) {
          isTargetCompanyMember = existingCandidate.companyMembers.some(
            (m) => m.companyId === companyId
          );
        } else if (db?.companyMember?.findFirst) {
          const member = await db.companyMember.findFirst({
            where: { userId: existingCandidate.id, companyId },
            select: { id: true },
          });
          isTargetCompanyMember = !!member;
        }
      }

      if (isTargetCompanyMember) {
        throw createApplicationError(
          "CANDIDATE_EMAIL_CONFLICT",
          "Resume email belongs to a non-candidate account",
          409
        );
      }

      await repository.ensureCandidateProfile(existingCandidate, safeExtractedData, companyId, db);

      return {
        candidate: existingCandidate,
        created: false,
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const candidateData = buildCandidateCreateData({
      extractedData: {
        ...safeExtractedData,
        email,
      },
      passwordHash,
    });

    try {
      const candidate = await repository.createCandidate(candidateData, db);
      await repository.ensureCandidateProfile(candidate, safeExtractedData, companyId, db);

      return {
        candidate,
        created: true,
      };
    } catch (error) {
      if (error?.code === "P2002") {
        // Fallback on clean connection to prevent 25P02 transaction abortion
        const recoveryDb = (tx && tx !== prisma && typeof tx.$executeRaw === "function") ? prisma : db;
        const concurrentCandidate = await repository.findCandidateByEmail(
          email,
          recoveryDb
        );

        if (concurrentCandidate) {
          if (concurrentCandidate.role === "SUPER_ADMIN") {
            throw createApplicationError(
              "CANDIDATE_EMAIL_CONFLICT",
              "Resume email belongs to a non-candidate account",
              409
            );
          }

          let isTargetCompanyMember = false;
          if (companyId) {
            if (Array.isArray(concurrentCandidate.companyMembers)) {
              isTargetCompanyMember = concurrentCandidate.companyMembers.some(
                (m) => m.companyId === companyId
              );
            } else if (recoveryDb?.companyMember?.findFirst) {
              const member = await recoveryDb.companyMember.findFirst({
                where: { userId: concurrentCandidate.id, companyId },
                select: { id: true },
              });
              isTargetCompanyMember = !!member;
            }
          }

          if (isTargetCompanyMember) {
            throw createApplicationError(
              "CANDIDATE_EMAIL_CONFLICT",
              "Resume email belongs to a non-candidate account",
              409
            );
          }

          await repository.ensureCandidateProfile(concurrentCandidate, safeExtractedData, companyId, recoveryDb);
          return {
            candidate: concurrentCandidate,
            created: false,
          };
        }
      }

      throw error;
    }
  });
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

async function resolveDirectUploadJob({ jobId, tx = prisma }) {
  if (!jobId) {
    return null;
  }

  const db = tx || prisma;
  if (db?.job?.findFirst) {
    const job = await db.job.findFirst({
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
    if (source === "INBOUND_EMAIL") {
      return await repository.updateJobApplication(
        existingApplication.id,
        {
          resumeProcessingId,
          source,
          candidateName: extractedData?.name || existingApplication.candidateName,
          status: "APPLIED",
          appliedAt: new Date(),
        },
        tx
      );
    }

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
  sourceEmail = null,
  isForwarded = false,
  subjectCode = null,
  storageService = defaultInMemoryStorageService,
  uploadedByUserId = null,
  companyId = null,
  emailSubject = null,
  emailBody = null,
  providerMessageId = null,
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
  
  let hashInput = file.buffer;
  if (isInbound && providerMessageId) {
    hashInput = Buffer.concat([file.buffer, Buffer.from(providerMessageId)]);
  }
  const fileHash = calculateSha256(hashInput);

  const existingResume = await repository.findResumeByHash(fileHash);

  if (existingResume && existingResume.status !== "FAILED") {
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

  const storageKey = existingResume ? existingResume.storageKey : buildStorageKey({
    fileHash,
    fileType,
  });

  const resumeProcessing = existingResume ? existingResume : await repository.createResumeProcessing(
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
        mimetype: file.mimetype,
        originalname: file.originalname,
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
          extractedData: parsed.extractedData || parsed.candidate || null,
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

    const extractedText = parsed.text || "";
    const jdRegex = /\b(job description|we are hiring|apply now|ctc|stipend|eligibility criteria|internship duration|job title)\b/gi;

    const matches = extractedText.match(jdRegex) || [];
    const uniqueMatches = new Set(matches.map(m => m.toLowerCase()));

    if (uniqueMatches.size >= 2) {
      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingFailedData({
          errorCode: "NOT_A_RESUME",
          errorMessage: "jd_language_detected",
        })
      );
      const error = new Error("jd_language_detected");
      error.code = "NOT_A_RESUME";
      throw error;
    }

    const score = [
      Boolean(extractedData.email),
      Boolean(extractedData.phone),
      Boolean(extractedData.skills && extractedData.skills.length > 0),
      Boolean(extractedText && extractedText.length >= 200)
    ].filter(Boolean).length;

    if (!extractedData.skills || extractedData.skills.length < 2) {
      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingFailedData({
          errorCode: "NOT_A_TECH_RESUME",
          errorMessage: "Fewer than 2 valid technical skills found in resume",
        })
      );
      const error = new Error("Fewer than 2 valid technical skills found in resume");
      error.code = "NOT_A_TECH_RESUME";
      throw error;
    }

    if (score < 2) {
      await repository.updateResumeProcessing(
        resumeProcessing.id,
        buildResumeProcessingFailedData({
          errorCode: "NOT_A_RESUME",
          errorMessage: "missing_resume_signals",
        })
      );
      const error = new Error("missing_resume_signals");
      error.code = "NOT_A_RESUME";
      throw error;
    }

    const job = isInbound
      ? await resolveInboundJob({
        inboundEmail,
        subjectCode,
        repository,
      })
      : await resolveDirectUploadJob({
        jobId,
      });

    let effectiveCompanyId = companyId || job?.companyId || null;
    if (!effectiveCompanyId && effectiveUploadedByUserId && prisma?.companyMember?.findFirst) {
      const member = await prisma.companyMember.findFirst({
        where: { userId: effectiveUploadedByUserId },
        select: { companyId: true },
      });
      if (member?.companyId) {
        effectiveCompanyId = member.companyId;
      }
    }

    const candidateResult = await createCandidateIfRequired({
      extractedData,
      sourceEmail,
      fallbackEmail: inboundEmail,
      isForwarded,
      companyId: effectiveCompanyId,
      source,
      emailSubject,
      emailBody,
    });

    const result = await prisma.$transaction(async (tx) => {
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
        effectiveCompanyId,
      };
    });

    if (result.application?.jobId && result.application?.job?.companyId) {
      socketService.emitToCompany(result.application.job.companyId, "NEW_JOB_APPLICATION", {
        jobId: result.application.jobId,
        applicationId: result.application.id,
      });
    }

    const targetCompanyId = result.effectiveCompanyId || result.candidate?.companyId || companyId;
    if (targetCompanyId) {
       socketService.emitToCompany(targetCompanyId, "CANDIDATES_REFRESH_REQUIRED", { candidateId: result.candidate.id });
    }

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
  createCandidateIfRequired,
};


