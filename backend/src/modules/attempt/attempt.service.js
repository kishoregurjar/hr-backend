const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { runTransaction } = require("../../config/prisma");
const attemptRepository = require("./attempt.repository");
const attemptMapper = require("./attempt.mapper");
const attemptDto = require("./attempt.dto");
const {
  ATTEMPT_ERRORS,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_ERROR_CODES,
  BULK_INVITATION_MAX_CANDIDATES,
  BULK_INVITATION_RESULT_STATUS,
  BULK_INVITATION_ERROR_CODES,
  ATTEMPT_ANSWER_ERROR_CODES,
  ATTEMPT_EVALUATION_STATUS,
  ATTEMPT_RESULT_STATUS,
  ATTEMPT_SUBMIT_ERROR_CODES,
  ATTEMPT_RESULT_ERROR_CODES,
  OTP_PURPOSE,
  OTP_CONFIG,
  OTP_ERROR_CODES,
  generateNumericOtp,
  hashOtp,
  verifyOtpHash,
  createOtpExpiryDate,
  isOtpExpired,
  hasExceededOtpAttempts,
  generateVerificationSessionToken,
  hashVerificationSessionToken,
  createVerificationSessionExpiryDate,
} = require("./attempt.constants");
const assessmentRepository = require("../assessment/assessment.repository");
const {
  AppError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} = require("../../common/errors");
const {
  unauthorized,
  conflict,
  badRequest,
  notFound,
  forbidden,
} = require("../../utils/app-error");
const { sendEmail } = require("../../utils/email");
const { buildCandidateOtpEmail, buildInvitationEmail } = require("./attempt.email");
const {
  hashAttemptToken,
  validateAttemptTokenFormat,
} = require("./attempt.security");

/**
 * Helper to create standard AppError based on HTTP status code
 */
const createServiceError = (code, message, statusCode = 400) => {
  switch (statusCode) {
    case 401:
      return unauthorized(message, code);
    case 403:
      return forbidden(message, code);
    case 404:
      return notFound(message, code);
    case 409:
      return conflict(message, code);
    default:
      return badRequest(message, code);
  }
};

const createAttemptSecurityError = (code, message, statusCode = 403) => {
  return createServiceError(code, message, statusCode);
};

const resolveAttemptFromToken = async ({ token, tx }) => {
  if (!validateAttemptTokenFormat(token)) {
    throw createAttemptSecurityError(
      "INVALID_ATTEMPT_TOKEN",
      "Invalid attempt token format",
      401
    );
  }

  const tokenHash = hashAttemptToken(token);

  const attempt = await attemptRepository.findAttemptByTokenHash({
    tokenHash,
    tx,
  });

  if (!attempt) {
    throw createAttemptSecurityError(
      "ATTEMPT_NOT_FOUND",
      "Attempt not found",
      404
    );
  }

  return attempt;
};

const assertAttemptOwnership = ({ attempt, candidateId }) => {
  if (!candidateId) {
    throw createAttemptSecurityError(
      "ATTEMPT_ACCESS_DENIED",
      "Attempt access denied",
      403
    );
  }

  if (attempt.candidateId && attempt.candidateId !== candidateId) {
    throw createAttemptSecurityError(
      "ATTEMPT_ACCESS_DENIED",
      "Attempt access denied",
      403
    );
  }
};

const assertQuestionBelongsToAttempt = async ({ attemptId, questionId, tx }) => {
  const attemptQuestion = await attemptRepository.findAttemptQuestion({
    attemptId,
    questionId,
    tx,
  });

  if (!attemptQuestion) {
    throw createAttemptSecurityError(
      "QUESTION_NOT_IN_ATTEMPT",
      "Question does not belong to this attempt",
      400
    );
  }

  return attemptQuestion;
};

const assertAttemptIdMatches = ({ resolvedAttemptId, requestedAttemptId }) => {
  if (requestedAttemptId && resolvedAttemptId !== requestedAttemptId) {
    throw createAttemptSecurityError(
      "ATTEMPT_ACCESS_DENIED",
      "Attempt access denied",
      403
    );
  }
};

/**
 * ------------------------------------------------------------
 * Assert HR / Admin Ownership Access for Assessment Results
 * ------------------------------------------------------------
 */
const assertAssessmentResultAccess = async ({
  assessmentId,
  user,
}) => {
  if (!user) {
    throw createServiceError(
      ATTEMPT_RESULT_ERROR_CODES.ACCESS_DENIED,
      "Authentication is required.",
      401
    );
  }

  if (
    user.role !== "SUPER_ADMIN" &&
    user.role !== "HR"
  ) {
    throw createServiceError(
      ATTEMPT_RESULT_ERROR_CODES.ACCESS_DENIED,
      "You are not authorized to access assessment results.",
      403
    );
  }

  const assessment =
    await attemptRepository.findAssessmentForResultAccess(
      assessmentId
    );

  if (!assessment) {
    throw createServiceError(
      ATTEMPT_RESULT_ERROR_CODES.ASSESSMENT_NOT_FOUND,
      "Assessment not found.",
      404
    );
  }

  if (
    user.role === "HR" &&
    assessment.createdById !== user.id
  ) {
    throw createServiceError(
      ATTEMPT_RESULT_ERROR_CODES.ACCESS_DENIED,
      "You do not have access to this assessment.",
      403
    );
  }

  return assessment;
};

/**
 * Helper to add minutes to a date
 */
const addMinutes = (date, minutes) => {
  return new Date(date.getTime() + minutes * 60 * 1000);
};

/**
 * ==========================================================
 * Assessment Attempt Service
 * ==========================================================
 * Pure Business Logic Layer for Assessment Attempts and
 * Candidate Invitation Lifecycle.
 * Handles Start Attempt, Verification, Expiration calculation,
 * Candidate Invitations, Bulk Invitations, and Transactional Snapshot Creation.
 * Placed directly at src/modules/attempt/attempt.service.js
 * matching 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */
class AttemptService {
  /**
   * Calculate Candidate Invitation Expiry Date
   */
  calculateInvitationExpiry(requestedExpiresAt) {
    const now = new Date();

    if (requestedExpiresAt) {
      if (!(requestedExpiresAt instanceof Date) || isNaN(requestedExpiresAt.getTime())) {
        throw new BadRequestError(
          "Invalid invitation expiry date.",
          ATTEMPT_ERRORS.INVALID_EXPIRY
        );
      }

      if (requestedExpiresAt <= now) {
        throw new BadRequestError(
          "Invitation expiry must be in the future.",
          ATTEMPT_ERRORS.INVALID_EXPIRY
        );
      }

      const maximumExpiry = new Date(
        now.getTime() + INVITATION_MAX_EXPIRY_HOURS * 60 * 60 * 1000
      );

      if (requestedExpiresAt > maximumExpiry) {
        throw new BadRequestError(
          `Invitation expiry cannot exceed ${INVITATION_MAX_EXPIRY_HOURS} hours.`,
          ATTEMPT_ERRORS.INVALID_EXPIRY
        );
      }

      return requestedExpiresAt;
    }

    return new Date(
      now.getTime() + INVITATION_DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000
    );
  }

  /**
   * Create Candidate Invitation
   */
  async createInvitation({
    assessmentId,
    candidateId,
    email,
    firstName,
    lastName,
    invitedByUserId,
    expiresAt,
  }) {
    if (!assessmentId) {
      throw new BadRequestError(
        "Assessment ID is required.",
        INVITATION_ERROR_CODES.ASSESSMENT_NOT_FOUND
      );
    }

    if (!candidateId && !email) {
      throw new BadRequestError(
        "Either candidateId or candidate email is required.",
        INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND
      );
    }

    if (!invitedByUserId) {
      throw new UnauthorizedError(
        "Authenticated HR user is required.",
        "AUTHENTICATION_REQUIRED"
      );
    }

    const result = await attemptRepository.transaction(async (tx) => {
      // 1. Verify assessment
      const assessment = await assessmentRepository.findById(
        assessmentId,
        { detailed: true },
        tx
      );

      if (!assessment) {
        throw new NotFoundError(
          "Assessment not found.",
          INVITATION_ERROR_CODES.ASSESSMENT_NOT_FOUND
        );
      }

      // 2. Archived assessment cannot receive invitations
      if (assessment.status === "ARCHIVED") {
        throw new ConflictError(
          "Archived assessments cannot receive invitations.",
          INVITATION_ERROR_CODES.ASSESSMENT_NOT_AVAILABLE
        );
      }

      // 3. Verify or auto-create candidate profile by email/id/name
      let candidateProfile = null;
      const normalizedEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;

      if (candidateId || normalizedEmail) {
        candidateProfile = await tx.candidateProfile.findFirst({
          where: {
            OR: [
              ...(candidateId ? [{ id: candidateId }, { userId: candidateId }] : []),
              ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ],
          },
        });
      }

      if (!candidateProfile && normalizedEmail) {
        const fName = (firstName || "").trim() || "Candidate";
        const lName = (lastName || "").trim() || "User";
        candidateProfile = await tx.candidateProfile.create({
          data: {
            email: normalizedEmail,
            firstName: fName,
            lastName: lName,
          },
        });
      }

      if (!candidateProfile) {
        candidateProfile = await tx.candidateProfile.findFirst({
          orderBy: { createdAt: "desc" },
        });
      }

      if (!candidateProfile) {
        throw new NotFoundError(
          "Candidate not found.",
          INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND
        );
      }

      const effectiveCandidateId = candidateProfile.id;

      // 4. Prevent duplicate active invitation
      const existing = await attemptRepository.findActiveInvitation(
        { assessmentId, candidateId: effectiveCandidateId },
        tx
      );

      if (existing) {
        throw new ConflictError(
          "Candidate already has an active invitation for this assessment.",
          INVITATION_ERROR_CODES.INVITATION_ALREADY_EXISTS
        );
      }

      // 5. Calculate expiration
      const effectiveExpiresAt = this.calculateInvitationExpiry(
        expiresAt,
        assessment
      );

      // 6. Generate secure raw token
      const rawToken = attemptMapper.generateInvitationToken();
      const tokenHash = attemptMapper.hashInvitationToken(rawToken);

      // 7. Persist invitation
      const invitationPayload = attemptMapper.toCreateInvitationEntity({
        assessmentId,
        candidateId: effectiveCandidateId,
        invitedByUserId,
        email: candidateProfile.email,
        tokenHash,
        expiresAt: effectiveExpiresAt,
      });

      const createdInvitation = await attemptRepository.createInvitation(
        invitationPayload,
        tx
      );

      return {
        invitation: {
          ...createdInvitation,
          rawToken,
        },
        rawToken,
        candidateProfile,
        assessment,
        effectiveExpiresAt,
      };
    });

    // 8. Automated Email Dispatch & sentAt Timestamp Update
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:3000";
    const testLink = `${clientUrl}/take-test?token=${result.rawToken}`;
    let emailSent = false;

    try {
      const emailContent = buildInvitationEmail({
        candidateName: `${result.candidateProfile.firstName} ${result.candidateProfile.lastName}`.trim(),
        assessmentTitle: result.assessment.title,
        testLink,
        expiresAt: result.effectiveExpiresAt,
      });

      await sendEmail({
        to: result.candidateProfile.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });

      emailSent = true;
      const now = new Date();
      await attemptRepository.updateInvitationStatus(result.invitation.id, "SENT");
      result.invitation.sentAt = now;
      result.invitation.status = "SENT";
    } catch (_emailErr) {
      console.error("Failed to send invitation email (SMTP missing/failed):", _emailErr.message);
    }

    return {
      invitation: result.invitation,
      rawToken: result.rawToken,
      testLink,
      emailSent,
    };
  }

  /**
   * ============================================================
   * Bulk Invitation Engine
   * ============================================================
   * Each candidate is processed independently.
   * Candidate A succeeds, Candidate B duplicate, Candidate C fails
   * A/B/C do NOT cause each other to rollback.
   * ============================================================
   */
  async createBulkInvitations({
    assessmentId,
    candidateIds,
    candidates,
    invitedByUserId,
    expiresAt,
  }) {
    if (!assessmentId) {
      throw new BadRequestError(
        "Assessment ID is required.",
        INVITATION_ERROR_CODES.ASSESSMENT_NOT_FOUND
      );
    }

    if (!invitedByUserId) {
      throw new UnauthorizedError(
        "Authenticated HR user is required.",
        "AUTHENTICATION_REQUIRED"
      );
    }

    let effectiveCandidateIds = Array.isArray(candidateIds) ? [...candidateIds] : [];

    if (Array.isArray(candidates) && candidates.length > 0) {
      for (const item of candidates) {
        const email = typeof item === "string" ? item.trim() : item?.email?.trim();
        const firstName = typeof item === "object" ? item?.firstName : undefined;
        const lastName = typeof item === "object" ? item?.lastName : undefined;

        if (email) {
          const normalizedEmail = email.toLowerCase();
          const candidate = await runTransaction(async (tx) => {
            let found = await tx.user.findUnique({
              where: { email: normalizedEmail },
              select: { id: true, email: true, role: true, isActive: true },
            });
            if (!found) {
              const randomPassword = crypto.randomBytes(32).toString("hex");
              const hashedPassword = await bcrypt.hash(randomPassword, 10);
              found = await tx.user.create({
                data: {
                  email: normalizedEmail,
                  password: hashedPassword,
                  firstName: firstName ? firstName.trim() : "Candidate",
                  lastName: lastName ? lastName.trim() : "User",
                  role: "CANDIDATE",
                  isActive: true,
                },
                select: { id: true, email: true, role: true, isActive: true },
              });
            }
            return found;
          });
          if (candidate && candidate.id) {
            effectiveCandidateIds.push(candidate.id);
          }
        }
      }
    }

    if (!Array.isArray(effectiveCandidateIds) || effectiveCandidateIds.length === 0) {
      throw new BadRequestError(
        "At least one candidate is required.",
        BULK_INVITATION_ERROR_CODES.EMPTY_CANDIDATES
      );
    }

    if (effectiveCandidateIds.length > BULK_INVITATION_MAX_CANDIDATES) {
      throw new BadRequestError(
        `A maximum of ${BULK_INVITATION_MAX_CANDIDATES} candidates can be processed per request.`,
        BULK_INVITATION_ERROR_CODES.TOO_MANY_CANDIDATES
      );
    }

    const uniqueCandidateIds = [...new Set(effectiveCandidateIds)];

    if (uniqueCandidateIds.length !== effectiveCandidateIds.length) {
      throw new BadRequestError(
        "Duplicate candidate IDs are not allowed.",
        BULK_INVITATION_ERROR_CODES.DUPLICATE_CANDIDATE_IDS
      );
    }

    const invitationExpiresAt = this.calculateInvitationExpiry(expiresAt);

    const assessment = await assessmentRepository.findById(assessmentId, {
      detailed: false,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        INVITATION_ERROR_CODES.ASSESSMENT_NOT_FOUND
      );
    }

    if (assessment.status === "ARCHIVED") {
      throw new ConflictError(
        "Archived assessments cannot receive invitations.",
        INVITATION_ERROR_CODES.ASSESSMENT_NOT_AVAILABLE
      );
    }

    const dbCandidates = await attemptRepository.findCandidatesByIds(
      uniqueCandidateIds
    );

    const candidateMap = new Map(
      dbCandidates.map((candidate) => [candidate.id, candidate])
    );

    const results = [];
    const emailJobs = [];

    for (const candidateId of uniqueCandidateIds) {
      const candidate = candidateMap.get(candidateId);

      if (!candidate) {
        results.push({
          candidateId,
          status: BULK_INVITATION_RESULT_STATUS.FAILED,
          code: INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND,
          message: "Candidate not found.",
        });
        continue;
      }

      if (!candidate.isActive) {
        results.push({
          candidateId,
          status: BULK_INVITATION_RESULT_STATUS.FAILED,
          code: "CANDIDATE_INACTIVE",
          message: "Candidate is inactive.",
        });
        continue;
      }

      try {
        const result = await attemptRepository.transaction(async (tx) => {
          const existing = await attemptRepository.findActiveInvitation(
            { assessmentId, candidateId },
            tx
          );

          if (existing) {
            return {
              duplicate: true,
              invitation: existing,
            };
          }

          const rawToken = attemptMapper.generateInvitationToken();
          const tokenHash = attemptMapper.hashInvitationToken(rawToken);

          const invitationData = attemptMapper.toCreateInvitationEntity({
            assessmentId,
            candidateId,
            invitedByUserId,
            email: candidate.email,
            tokenHash,
            expiresAt: invitationExpiresAt,
          });

          const invitation = await attemptRepository.createInvitation(
            invitationData,
            tx
          );

          return {
            duplicate: false,
            invitation,
            rawToken,
          };
        });

        if (result.duplicate) {
          results.push({
            candidateId,
            status: BULK_INVITATION_RESULT_STATUS.DUPLICATE,
            code: INVITATION_ERROR_CODES.DUPLICATE_INVITATION,
            invitationId: result.invitation.id,
            message: "An active invitation already exists.",
          });
          continue;
        }

        results.push({
          candidateId,
          status: BULK_INVITATION_RESULT_STATUS.CREATED,
          invitationId: result.invitation.id,
          email: candidate.email,
        });

        emailJobs.push({
          invitationId: result.invitation.id,
          candidateId,
          email: candidate.email,
          rawToken: result.rawToken,
          assessmentId,
          expiresAt: result.invitation.expiresAt,
        });
      } catch (error) {
        const isDuplicate =
          error.code === "P2002" ||
          error.code === INVITATION_ERROR_CODES.DUPLICATE_INVITATION;

        results.push({
          candidateId,
          status: isDuplicate
            ? BULK_INVITATION_RESULT_STATUS.DUPLICATE
            : BULK_INVITATION_RESULT_STATUS.FAILED,
          code: isDuplicate
            ? INVITATION_ERROR_CODES.DUPLICATE_INVITATION
            : error.code || "INVITATION_CREATION_FAILED",
          message: isDuplicate
            ? "An active invitation already exists."
            : "Invitation could not be created.",
        });
      }
    }

    const summary = {
      total: uniqueCandidateIds.length,
      created: results.filter(
        (item) => item.status === BULK_INVITATION_RESULT_STATUS.CREATED
      ).length,
      duplicate: results.filter(
        (item) => item.status === BULK_INVITATION_RESULT_STATUS.DUPLICATE
      ).length,
      failed: results.filter(
        (item) => item.status === BULK_INVITATION_RESULT_STATUS.FAILED
      ).length,
    };

    return {
      summary,
      results,
      emailJobs,
    };
  }

  /**
   * Find & Validate Candidate Invitation By Raw Magic Token
   */
  async findInvitationByRawToken(rawToken, tx) {
    if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
      throw new BadRequestError(
        "Invalid invitation token.",
        INVITATION_ERROR_CODES.INVALID_TOKEN
      );
    }

    const tokenHash = attemptMapper.hashInvitationToken(rawToken.trim());

    const invitation = await attemptRepository.findInvitationByTokenHash(
      tokenHash,
      tx
    );

    if (!invitation) {
      throw new NotFoundError(
        "Invitation not found.",
        INVITATION_ERROR_CODES.INVITATION_NOT_FOUND
      );
    }

    if (invitation.expiresAt <= new Date()) {
      throw new ConflictError(
        "Invitation token has expired.",
        INVITATION_ERROR_CODES.TOKEN_EXPIRED
      );
    }

    if (invitation.status === "COMPLETED" || invitation.status === "EXPIRED") {
      throw new ConflictError(
        "Invitation token is no longer valid.",
        INVITATION_ERROR_CODES.TOKEN_ALREADY_USED
      );
    }

    return invitation;
  }

  /**
   * Validate Assessment Availability
   */
  validateAssessmentAvailability(assessment, now = new Date()) {
    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_FOUND
      );
    }

    if (assessment.status !== "ACTIVE" && assessment.status !== "PUBLISHED") {
      throw new ConflictError(
        "Assessment is not currently active.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_ACTIVE
      );
    }

    if (assessment.startsAt && now < new Date(assessment.startsAt)) {
      throw new ConflictError(
        "Assessment has not started yet.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_AVAILABLE
      );
    }

    if (assessment.endsAt && now > new Date(assessment.endsAt)) {
      throw new ConflictError(
        "Assessment availability period has ended.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_AVAILABLE
      );
    }
  }

  /**
   * Calculate Effective Expiry Date
   */
  calculateExpiresAt({ startedAt, durationMinutes, endsAt }) {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestError(
        "Assessment duration is invalid.",
        ATTEMPT_ERRORS.INVALID_REQUEST
      );
    }

    const durationExpiry = addMinutes(startedAt, durationMinutes);
    if (endsAt && new Date(endsAt) < durationExpiry) {
      return new Date(endsAt);
    }

    return durationExpiry;
  }

  /**
   * Extract Questions Array from Assessment Record
   */
  getAssessmentQuestions(assessment) {
    const questions = assessment.questions || [];
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new ConflictError(
        "Assessment does not contain any assigned questions.",
        ATTEMPT_ERRORS.INVALID_REQUEST
      );
    }
    return questions;
  }

  /**
   * Calculate Server-Generated Attempt Number
   */
  async calculateAttemptNumber({ assessmentId, candidateId }, tx) {
    const latestAttempt = await attemptRepository.findLatestAttempt(
      { assessmentId, candidateId },
      tx
    );

    if (!latestAttempt) {
      return 1;
    }

    return latestAttempt.attemptNumber + 1;
  }

  /**
   * Check & Validate Maximum Attempts Limit
   */
  async validateMaximumAttempts({ assessment, assessmentId, candidateId }, tx) {
    const attemptCount = await attemptRepository.countAttempts(
      { assessmentId, candidateId },
      tx
    );

    if (attemptCount >= assessment.maxAttempts) {
      throw new ConflictError(
        "Maximum assessment attempts reached.",
        ATTEMPT_ERRORS.MAX_ATTEMPTS_REACHED
      );
    }

    return attemptCount;
  }

  /**
   * Ensure No Active Attempt Exists
   */
  async ensureNoActiveAttempt({ assessmentId, candidateId }, tx) {
    const activeAttempt = await attemptRepository.findActiveAttempt(
      { assessmentId, candidateId },
      tx
    );

    if (activeAttempt) {
      throw new ConflictError(
        "An active assessment attempt already exists.",
        ATTEMPT_ERRORS.ACTIVE_ATTEMPT_EXISTS
      );
    }
  }

  /**
   * Start New Assessment Attempt
   */
  async startAttempt({ assessmentId, candidateId }) {
    if (!assessmentId) {
      throw new BadRequestError(
        "Assessment ID is required.",
        ATTEMPT_ERRORS.ASSESSMENT_NOT_FOUND
      );
    }

    if (!candidateId) {
      throw new UnauthorizedError(
        "Candidate identity is required.",
        ATTEMPT_ERRORS.OWNERSHIP_REQUIRED
      );
    }

    return runTransaction(async (tx) => {
      const now = new Date();

      // 1. Load Assessment
      const assessment = await assessmentRepository.findById(
        assessmentId,
        { includeDeleted: false, detailed: true },
        tx
      );

      // 2. Validate Assessment Availability
      this.validateAssessmentAvailability(assessment, now);

      // 3. Validate Assessment Questions Configuration
      const assessmentQuestions = this.getAssessmentQuestions(assessment);

      // 4. Ensure No Active IN_PROGRESS Attempt Exists
      await this.ensureNoActiveAttempt({ assessmentId, candidateId }, tx);

      // 5. Validate Maximum Attempts Limit
      await this.validateMaximumAttempts({ assessment, assessmentId, candidateId }, tx);

      // 6. Calculate Attempt Number
      const attemptNumber = await this.calculateAttemptNumber({ assessmentId, candidateId }, tx);

      // 7. Calculate Expiry Date
      const startedAt = now;
      const expiresAt = this.calculateExpiresAt({
        startedAt,
        durationMinutes: assessment.durationMinutes,
        endsAt: assessment.endsAt,
      });

      // 8. Map Persistence Attempt Payload
      const attemptData = attemptMapper.toCreateEntity({
        assessmentId,
        candidateId,
        attemptNumber,
        startedAt,
        expiresAt,
      });

      // 9. Persist AssessmentAttempt Record
      const attempt = await attemptRepository.createAttempt(attemptData, tx);

      // 10. Create Immutable Question Snapshot Records
      const attemptQuestionData = attemptMapper.createQuestionSnapshot(
        assessmentQuestions,
        attempt.id
      );

      if (attemptQuestionData.length === 0) {
        throw new ConflictError(
          "Assessment cannot be started without questions.",
          ATTEMPT_ERRORS.INVALID_REQUEST
        );
      }

      await attemptRepository.createAttemptQuestions(attemptQuestionData, tx);

      // 11. Retrieve Final Created Attempt Record
      const createdAttempt = await attemptRepository.findById(
        attempt.id,
        { includeQuestions: true },
        tx
      );

      if (!createdAttempt) {
        throw new NotFoundError(
          "Created assessment attempt could not be retrieved.",
          ATTEMPT_ERRORS.NOT_FOUND
        );
      }

      return createdAttempt;
    });
  }

  /**
   * ============================================================
   * Start Attempt By Invitation Token (Passwordless Entry Point)
   * ============================================================
   * 1. Validate rawToken & find invitation
   * 2. Verify invitation expiry & non-terminal status
   * 3. Update invitation status to OPENED if PENDING/SENT
   * 4. Resolve candidateId & assessmentId from invitation
   * 5. Check if active attempt exists (idempotent entry on refresh)
   * 6. Otherwise start new attempt & snapshot questions
   * ============================================================
   */
  async startAttemptByToken({ token, candidateSession }) {
    if (!candidateSession && (typeof token !== "string" || !token.trim())) {
      throw new BadRequestError(
        "Candidate verification session or invitation token is required.",
        INVITATION_ERROR_CODES.INVALID_TOKEN
      );
    }

    const normalizedToken = typeof token === "string" && token.trim() ? token.trim() : null;
    const tokenHash = normalizedToken ? attemptMapper.hashInvitationToken(normalizedToken) : null;

    return runTransaction(async (tx) => {
      const now = new Date();

      // 1. Find invitation using candidateSession or tokenHash
      let invitation = null;
      if (candidateSession?.candidateAssessmentId) {
        invitation = await attemptRepository.findInvitationById(candidateSession.candidateAssessmentId, tx);
      }
      if (!invitation && candidateSession?.candidateId && candidateSession?.assessmentId) {
        invitation = await attemptRepository.findInvitationByCandidateAndAssessment(
          {
            candidateId: candidateSession.candidateId,
            assessmentId: candidateSession.assessmentId,
          },
          tx
        );
      }
      if (!invitation && tokenHash) {
        invitation = await attemptRepository.findInvitationByTokenHash(tokenHash, tx);
      }

      if (!invitation) {
        throw new NotFoundError(
          "Invitation not found.",
          INVITATION_ERROR_CODES.INVITATION_NOT_FOUND
        );
      }

      // Lock invitation & candidate assessment row for concurrent start requests
      await attemptRepository.lockInvitationRow(invitation.id, tx);
      await attemptRepository.lockCandidateAssessment(
        {
          candidateId: invitation.candidateId,
          assessmentId: invitation.assessmentId,
          candidateAssessmentId: invitation.id,
        },
        tx
      );

      // 2. Validate invitation expiry
      if (invitation.expiresAt <= now) {
        await attemptRepository.markInvitationExpired(invitation.id, tx);
        throw new ConflictError(
          "Invitation token has expired.",
          INVITATION_ERROR_CODES.TOKEN_EXPIRED
        );
      }

      // 3. Validate invitation status
      if (invitation.status === "COMPLETED") {
        throw new ConflictError(
          "This invitation has already been completed.",
          INVITATION_ERROR_CODES.TOKEN_ALREADY_USED
        );
      }

      if (invitation.status === "EXPIRED") {
        throw new ConflictError(
          "Invitation token has expired.",
          INVITATION_ERROR_CODES.TOKEN_EXPIRED
        );
      }

      if (
        invitation.status !== "PENDING" &&
        invitation.status !== "SENT" &&
        invitation.status !== "OPENED"
      ) {
        throw new ConflictError(
          "Invitation token is not usable.",
          INVITATION_ERROR_CODES.INVALID_TOKEN
        );
      }

      // 4. Verify candidate
      const candidate = invitation.candidate;
      if (!candidate) {
        throw new ForbiddenError(
          "Invitation does not belong to a valid candidate.",
          INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND
        );
      }

      // 5. Verify assessment availability
      const assessment = invitation.assessment;
      this.validateAssessmentAvailability(assessment, now);

      // 6. Get assessment questions
      const assessmentQuestions = this.getAssessmentQuestions(assessment);

      // 7. Check existing active attempt
      const existingActiveAttempt = await attemptRepository.findActiveAttempt(
        {
          assessmentId: assessment.id,
          candidateId: candidate.id,
        },
        tx
      );

      if (existingActiveAttempt) {
        const fullAttempt = await attemptRepository.findById(
          existingActiveAttempt.id,
          { includeQuestions: true },
          tx
        );
        if (fullAttempt) {
          return fullAttempt;
        }
        return existingActiveAttempt;
      }

      // 8. Check maximum attempts
      await this.validateMaximumAttempts(
        {
          assessment,
          assessmentId: assessment.id,
          candidateId: candidate.id,
        },
        tx
      );

      // 9. Calculate attempt number
      const attemptNumber = await this.calculateAttemptNumber(
        {
          assessmentId: assessment.id,
          candidateId: candidate.id,
        },
        tx
      );

      // 10. Calculate timing
      const startedAt = now;
      const expiresAt = this.calculateExpiresAt({
        startedAt,
        durationMinutes: assessment.durationMinutes,
        endsAt: assessment.endsAt,
      });

      // 11. Map attempt
      const attemptData = attemptMapper.toCreateEntity({
        assessmentId: assessment.id,
        candidateId: candidate.id,
        attemptNumber,
        startedAt,
        expiresAt,
      });

      // 12. Create AssessmentAttempt
      const attempt = await attemptRepository.createAttempt(attemptData, tx);

      // 13. Create immutable question snapshot
      const attemptQuestionData = attemptMapper.createQuestionSnapshot(
        assessmentQuestions,
        attempt.id
      );

      if (attemptQuestionData.length === 0) {
        throw new ConflictError(
          "Assessment cannot be started without questions.",
          "ASSESSMENT_HAS_NO_QUESTIONS"
        );
      }

      await attemptRepository.createAttemptQuestions(attemptQuestionData, tx);

      // 14. Atomically consume invitation
      const opened = await attemptRepository.markInvitationOpenedIfUsable(
        invitation.id,
        now,
        tx
      );

      if (!opened && invitation.status !== "OPENED") {
        throw new ConflictError(
          "Invitation could not be consumed.",
          INVITATION_ERROR_CODES.INVALID_TOKEN
        );
      }

      // 15. Load final candidate-safe attempt
      const createdAttempt = await attemptRepository.findById(
        attempt.id,
        { includeQuestions: true },
        tx
      );

      if (!createdAttempt) {
        throw new NotFoundError(
          "Assessment attempt could not be retrieved after creation.",
          ATTEMPT_ERRORS.NOT_FOUND
        );
      }

      return createdAttempt;
    });
  }

  /**
   * ------------------------------------------------------------
   * Get Current Attempt By Invitation Token
   * ------------------------------------------------------------
   * Resumes candidate's active IN_PROGRESS attempt safely.
   * candidateId, assessmentId are resolved from the valid token.
   * ------------------------------------------------------------
   */
  async getCurrentAttemptByToken({ token }) {
    // 1. Validate token
    if (typeof token !== "string" || !token.trim()) {
      throw new BadRequestError(
        "Invitation token is required.",
        INVITATION_ERROR_CODES.INVALID_TOKEN
      );
    }

    const normalizedToken = token.trim();

    // 2. Hash raw token
    const tokenHash = attemptMapper.hashInvitationToken(normalizedToken);

    // 3. Find invitation
    const invitation = await attemptRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new NotFoundError(
        "Invitation not found.",
        INVITATION_ERROR_CODES.INVITATION_NOT_FOUND
      );
    }

    const now = new Date();

    // 4. Validate invitation expiry
    if (invitation.expiresAt <= now) {
      try {
        await attemptRepository.markInvitationExpired(invitation.id);
      } catch (_error) {
        // Silent catch for best-effort status update
      }

      throw new ConflictError(
        "Invitation token has expired.",
        INVITATION_ERROR_CODES.TOKEN_EXPIRED
      );
    }

    // 5. Validate invitation state
    if (invitation.status === "EXPIRED") {
      throw new ConflictError(
        "Invitation token has expired.",
        INVITATION_ERROR_CODES.TOKEN_EXPIRED
      );
    }

    if (invitation.status === "COMPLETED") {
      throw new ConflictError(
        "This invitation has already been completed.",
        INVITATION_ERROR_CODES.TOKEN_ALREADY_USED
      );
    }

    // 6. Candidate validation
    const candidate = invitation.candidate;

    if (!candidate) {
      throw new NotFoundError(
        "Candidate could not be resolved.",
        INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND
      );
    }

    if (candidate.role !== "CANDIDATE") {
      throw new ForbiddenError(
        "Invitation does not belong to a candidate.",
        INVITATION_ERROR_CODES.CANDIDATE_NOT_FOUND
      );
    }

    if (!candidate.isActive) {
      throw new ForbiddenError(
        "Candidate account is inactive.",
        "CANDIDATE_INACTIVE"
      );
    }

    // 7. Assessment validation
    if (!invitation.assessment) {
      throw new NotFoundError(
        "Assessment could not be resolved.",
        INVITATION_ERROR_CODES.ASSESSMENT_NOT_FOUND
      );
    }

    // 8. Find IN_PROGRESS attempt
    const attempt = await attemptRepository.findCurrentAttempt({
      assessmentId: invitation.assessmentId,
      candidateId: candidate.id,
    });

    // 9. No active attempt
    if (!attempt) {
      throw new NotFoundError(
        "No active assessment attempt found.",
        ATTEMPT_ERRORS.NOT_FOUND
      );
    }

    // 10. Attempt expiry
    if (attempt.expiresAt <= now) {
      await attemptRepository.expireAttemptIfActive(attempt.id, now);

      throw new ConflictError(
        "Assessment attempt has expired.",
        ATTEMPT_ERRORS.ATTEMPT_EXPIRED
      );
    }

    // 11. Defensive status check
    if (attempt.status !== "IN_PROGRESS") {
      throw new ConflictError(
        "Assessment attempt is not active.",
        ATTEMPT_ERRORS.INVALID_STATE
      );
    }

    // 12. Candidate-safe response
    return attempt;
  }

  /**
   * ------------------------------------------------------------
   * Normalize Option IDs Array
   * ------------------------------------------------------------
   */
  normalizeOptionIds(ids) {
    if (!Array.isArray(ids)) {
      return [];
    }

    return [
      ...new Set(
        ids
          .filter((id) => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ].sort();
  }

  /**
   * ------------------------------------------------------------
   * Compare Option Sets Equality
   * ------------------------------------------------------------
   */
  areOptionSetsEqual(submitted, correct) {
    const submittedIds = this.normalizeOptionIds(submitted);
    const correctIds = this.normalizeOptionIds(correct);

    if (submittedIds.length !== correctIds.length) {
      return false;
    }

    return submittedIds.every(
      (id, index) => id === correctIds[index]
    );
  }

  /**
   * ------------------------------------------------------------
   * Evaluate Objective Question
   * ------------------------------------------------------------
   */
  evaluateObjectiveQuestion({ question, answer }) {
    if (!answer) {
      return {
        status: ATTEMPT_EVALUATION_STATUS.UNANSWERED,
        isCorrect: false,
      };
    }

    const selected = this.normalizeOptionIds(answer.selectedOptionIds);

    if (selected.length === 0) {
      return {
        status: ATTEMPT_EVALUATION_STATUS.UNANSWERED,
        isCorrect: false,
      };
    }

    const correctOptionIds = (question.options || [])
      .filter((option) => option.isCorrect === true)
      .map((option) => option.id);

    const isCorrect = this.areOptionSetsEqual(selected, correctOptionIds);

    return {
      status: isCorrect
        ? ATTEMPT_EVALUATION_STATUS.CORRECT
        : ATTEMPT_EVALUATION_STATUS.INCORRECT,
      isCorrect,
    };
  }

  /**
   * ------------------------------------------------------------
   * Evaluate Attempt Question with Marks & Penalties
   * ------------------------------------------------------------
   */
  evaluateAttemptQuestion({ attemptQuestion }) {
    const answer = attemptQuestion.answers?.[0];
    const question = attemptQuestion.question;

    /**
     * Objective questions.
     */
    if (
      question.type === "SINGLE_CHOICE" ||
      question.type === "MULTIPLE_CHOICE" ||
      question.type === "TRUE_FALSE"
    ) {
      const result = this.evaluateObjectiveQuestion({
        question,
        answer,
      });

      if (result.status === ATTEMPT_EVALUATION_STATUS.CORRECT) {
        return {
          ...result,
          positiveMarks: Number(attemptQuestion.marks),
          negativeMarks: 0,
        };
      }

      if (result.status === ATTEMPT_EVALUATION_STATUS.INCORRECT) {
        return {
          ...result,
          positiveMarks: 0,
          negativeMarks: Number(attemptQuestion.negativeMarks || 0),
        };
      }

      return {
        ...result,
        positiveMarks: 0,
        negativeMarks: 0,
      };
    }

    /**
     * Subjective questions cannot be automatically
     * evaluated by this objective engine.
     */
    if (
      question.type === "SHORT_ANSWER" ||
      question.type === "CODING" ||
      question.type === "SQL" ||
      question.type === "PUZZLE"
    ) {
      if (
        answer &&
        typeof answer.answerText === "string" &&
        answer.answerText.trim().length > 0
      ) {
        return {
          status: ATTEMPT_EVALUATION_STATUS.UNANSWERED,
          positiveMarks: 0,
          negativeMarks: 0,
          requiresManualEvaluation: true,
        };
      }

      return {
        status: ATTEMPT_EVALUATION_STATUS.UNANSWERED,
        positiveMarks: 0,
        negativeMarks: 0,
        requiresManualEvaluation: true,
      };
    }

    throw new AppError({
      message: "Unsupported question type encountered during evaluation.",
      statusCode: 500,
      errorCode: ATTEMPT_SUBMIT_ERROR_CODES.EVALUATION_FAILED,
    });
  }

  /**
   * ------------------------------------------------------------
   * Calculate Aggregate Attempt Score
   * ------------------------------------------------------------
   * Calculates total positive marks, negative marks penalty,
   * net final score (floored at 0 minimum), and question count breakdown.
   * ------------------------------------------------------------
   */
  calculateAttemptScore(evaluations) {
    let positiveMarks = 0;
    let negativeMarks = 0;

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    for (const evaluation of evaluations) {
      positiveMarks += evaluation.positiveMarks;
      negativeMarks += evaluation.negativeMarks;

      if (evaluation.status === ATTEMPT_EVALUATION_STATUS.CORRECT) {
        correctCount += 1;
      }

      if (evaluation.status === ATTEMPT_EVALUATION_STATUS.INCORRECT) {
        incorrectCount += 1;
      }

      if (evaluation.status === ATTEMPT_EVALUATION_STATUS.UNANSWERED) {
        unansweredCount += 1;
      }
    }

    const rawScore = positiveMarks - negativeMarks;
    const finalScore = Math.max(0, rawScore);

    return {
      positiveMarks,
      negativeMarks,
      finalScore,
      correctCount,
      incorrectCount,
      unansweredCount,
    };
  }

  /**
   * ------------------------------------------------------------
   * Calculate Percentage & Pass/Fail Status
   * ------------------------------------------------------------
   * Calculates normalized percentage against assessment maximum score
   * and evaluates pass/fail status against passing score.
   * ------------------------------------------------------------
   */
  calculateAttemptResult({ finalScore, passingScore, maximumScore }) {
    const rawPercentage = maximumScore > 0 ? (finalScore / maximumScore) * 100 : 0;
    const percentage = Number(Math.min(100, Math.max(0, rawPercentage)).toFixed(2));
    const passed = finalScore >= passingScore;

    return {
      percentage,
      passed,
    };
  }

  /**
   * ------------------------------------------------------------
   * Determine Pass / Fail Result Status
   * ------------------------------------------------------------
   */
  determineResult({ finalScore, passingScore }) {
    return finalScore >= Number(passingScore)
      ? ATTEMPT_RESULT_STATUS.PASSED
      : ATTEMPT_RESULT_STATUS.FAILED;
  }

  /**
   * ------------------------------------------------------------
   * Validate Selected Options Against Snapshot
   * ------------------------------------------------------------
   */
  validateSelectedOptions(selectedOptionIds, question) {
    const normalizedIds = attemptMapper.normalizeSelectedOptionIds(selectedOptionIds);
    const availableOptionIds = new Set(
      (question.options || []).map((option) => option.id)
    );

    for (const optionId of normalizedIds) {
      if (!availableOptionIds.has(optionId)) {
        throw new BadRequestError(
          "One or more selected options do not belong to this question.",
          ATTEMPT_ANSWER_ERROR_CODES.INVALID_OPTION
        );
      }
    }

    const count = normalizedIds.length;

    if (
      question.type === "SINGLE_CHOICE" ||
      question.type === "TRUE_FALSE"
    ) {
      if (count !== 1) {
        throw new BadRequestError(
          "This question requires exactly one selected option.",
          ATTEMPT_ANSWER_ERROR_CODES.INVALID_OPTION_COUNT
        );
      }
    }

    if (question.type === "MULTIPLE_CHOICE") {
      if (count < 1) {
        throw new BadRequestError(
          "At least one option must be selected.",
          ATTEMPT_ANSWER_ERROR_CODES.INVALID_OPTION_COUNT
        );
      }
    }

    return normalizedIds;
  }

  /**
   * ------------------------------------------------------------
   * Validate Answer Text
   * ------------------------------------------------------------
   */
  validateAnswerText(answerText, question) {
    const normalized = attemptMapper.normalizeAnswerText(answerText);

    const isSubjective =
      question.type === "SHORT_ANSWER" ||
      question.type === "CODING" ||
      question.type === "SQL" ||
      question.type === "PUZZLE";

    if (isSubjective) {
      if (!normalized) {
        throw new BadRequestError(
          "Answer text is required for this question.",
          ATTEMPT_ANSWER_ERROR_CODES.ANSWER_TEXT_REQUIRED
        );
      }

      return normalized;
    }

    if (normalized) {
      throw new BadRequestError(
        "Text answers are not allowed for this question.",
        ATTEMPT_ANSWER_ERROR_CODES.ANSWER_TEXT_NOT_ALLOWED
      );
    }

    return null;
  }

  /**
   * ============================================================
   * SAVE ANSWER BY INVITATION TOKEN (Autosave Engine)
   * ============================================================
   */
  async saveAnswerByToken({
    token,
    questionId,
    selectedOptionIds,
    answerText,
  }) {
    if (typeof token !== "string" || !token.trim()) {
      throw new BadRequestError(
        "Invitation token is required.",
        ATTEMPT_ANSWER_ERROR_CODES.INVITATION_INVALID
      );
    }

    if (!questionId || typeof questionId !== "string" || !questionId.trim()) {
      throw new BadRequestError(
        "Question ID is required.",
        ATTEMPT_ANSWER_ERROR_CODES.QUESTION_NOT_FOUND
      );
    }

    const normalizedToken = token.trim();
    const tokenHash = attemptMapper.hashInvitationToken(normalizedToken);

    const invitation = await attemptRepository.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new NotFoundError(
        "Invitation is invalid.",
        ATTEMPT_ANSWER_ERROR_CODES.INVITATION_INVALID
      );
    }

    const now = new Date();

    if (invitation.expiresAt <= now) {
      throw new ConflictError(
        "Invitation has expired.",
        ATTEMPT_ANSWER_ERROR_CODES.ATTEMPT_EXPIRED
      );
    }

    if (!invitation.candidate || invitation.candidate.role !== "CANDIDATE") {
      throw new ForbiddenError(
        "Invalid candidate invitation.",
        ATTEMPT_ANSWER_ERROR_CODES.INVITATION_INVALID
      );
    }

    if (!invitation.candidate.isActive) {
      throw new ForbiddenError(
        "Candidate account is inactive.",
        "CANDIDATE_INACTIVE"
      );
    }

    return attemptRepository.transaction(async (tx) => {
      const attempt = await attemptRepository.findActiveAttemptForCandidate(
        {
          assessmentId: invitation.assessmentId,
          candidateId: invitation.candidate.id,
        },
        tx
      );

      if (!attempt) {
        throw new NotFoundError(
          "No active assessment attempt found.",
          ATTEMPT_ERRORS.NOT_FOUND
        );
      }

      if (attempt.status !== "IN_PROGRESS") {
        throw new ConflictError(
          "Assessment attempt is not active.",
          ATTEMPT_ANSWER_ERROR_CODES.ATTEMPT_NOT_ACTIVE
        );
      }

      if (attempt.expiresAt <= now) {
        await attemptRepository.expireAttemptIfActive(
          attempt.id,
          now,
          tx
        );

        throw new ConflictError(
          "Assessment attempt has expired.",
          ATTEMPT_ANSWER_ERROR_CODES.ATTEMPT_EXPIRED
        );
      }

      const attemptQuestion = await attemptRepository.findAttemptQuestionForAnswer(
        {
          attemptId: attempt.id,
          questionId,
        },
        tx
      );

      if (!attemptQuestion) {
        throw new NotFoundError(
          "Question does not belong to this assessment attempt.",
          ATTEMPT_ANSWER_ERROR_CODES.QUESTION_NOT_FOUND
        );
      }

      const question = attemptQuestion.question;

      if (!question) {
        throw new NotFoundError(
          "Question snapshot could not be resolved.",
          ATTEMPT_ANSWER_ERROR_CODES.QUESTION_NOT_FOUND
        );
      }

      let normalizedOptions = [];
      let normalizedText = null;

      if (Array.isArray(selectedOptionIds)) {
        normalizedOptions = this.validateSelectedOptions(
          selectedOptionIds,
          question
        );
      }

      if (typeof answerText === "string") {
        normalizedText = this.validateAnswerText(
          answerText,
          question
        );
      }

      const hasOptions = normalizedOptions.length > 0;
      const hasText = typeof normalizedText === "string" && normalizedText.length > 0;

      if (!hasOptions && !hasText) {
        throw new BadRequestError(
          "Answer cannot be empty.",
          ATTEMPT_ANSWER_ERROR_CODES.INVALID_ANSWER
        );
      }

      const answerData = attemptMapper.toAttemptAnswerEntity({
        attemptId: attempt.id,
        questionId: attemptQuestion.questionId,
        selectedOptionIds: hasOptions ? normalizedOptions : [],
        answerText: hasText ? normalizedText : null,
      });

      const answer = await attemptRepository.upsertAttemptAnswer(
        answerData,
        tx
      );

      return answer;
    });
  }

  async saveAnswer(payload) {
    return this.saveAnswerByToken(payload);
  }

  /**
   * ============================================================
   * SUBMIT ATTEMPT BY INVITATION TOKEN & EVALUATE ENGINE
   * ============================================================
   */
  async submitAttemptByToken({ token }) {
    if (typeof token !== "string" || !token.trim()) {
      throw new BadRequestError(
        "Invitation token is required.",
        ATTEMPT_SUBMIT_ERROR_CODES.INVITATION_NOT_FOUND
      );
    }

    const normalizedToken = token.trim();
    const tokenHash = attemptMapper.hashInvitationToken(normalizedToken);

    return attemptRepository.transaction(async (tx) => {
      /**
       * ------------------------------------------------------
       * 1. Resolve invitation
       * ------------------------------------------------------
       */
      const invitation = await attemptRepository.findInvitationByTokenHash(
        tokenHash,
        tx
      );

      if (!invitation) {
        throw new NotFoundError(
          "Invitation not found.",
          ATTEMPT_SUBMIT_ERROR_CODES.INVITATION_NOT_FOUND
        );
      }

      const now = new Date();

      /**
       * ------------------------------------------------------
       * 2. Invitation expiry
       * ------------------------------------------------------
       */
      if (invitation.expiresAt <= now) {
        throw new ConflictError(
          "Invitation has expired.",
          ATTEMPT_SUBMIT_ERROR_CODES.INVITATION_EXPIRED
        );
      }

      /**
       * ------------------------------------------------------
       * 3. Candidate validation
       * ------------------------------------------------------
       */
      if (!invitation.candidate) {
        throw new NotFoundError(
          "Candidate could not be resolved.",
          ATTEMPT_SUBMIT_ERROR_CODES.CANDIDATE_NOT_FOUND
        );
      }

      if (invitation.candidate.role !== "CANDIDATE") {
        throw new ForbiddenError(
          "Invalid candidate invitation.",
          ATTEMPT_SUBMIT_ERROR_CODES.CANDIDATE_NOT_FOUND
        );
      }

      /**
       * ------------------------------------------------------
       * 4. Find current attempt
       * ------------------------------------------------------
       */
      const currentAttempt = await attemptRepository.findActiveAttemptForCandidate(
        {
          assessmentId: invitation.assessmentId,
          candidateId: invitation.candidate.id,
        },
        tx
      );

      if (!currentAttempt) {
        throw new NotFoundError(
          "No active assessment attempt found.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      /**
       * ------------------------------------------------------
       * 5. Lock attempt
       * ------------------------------------------------------
       */
      const lockedAttempt = await attemptRepository.lockAttemptRow(
        currentAttempt.id,
        tx
      );

      if (!lockedAttempt) {
        throw new NotFoundError(
          "Assessment attempt could not be locked.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      /**
       * ------------------------------------------------------
       * 6. Double-submit protection
       * ------------------------------------------------------
       */
      if (lockedAttempt.status === "SUBMITTED") {
        throw new ConflictError(
          "Assessment attempt has already been submitted.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_ALREADY_SUBMITTED
        );
      }

      if (lockedAttempt.status !== "IN_PROGRESS") {
        throw new ConflictError(
          "Assessment attempt cannot be submitted in its current state.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_SUBMITTABLE
        );
      }

      /**
       * ------------------------------------------------------
       * 7. Server-side expiry
       * ------------------------------------------------------
       */
      if (lockedAttempt.expiresAt <= now) {
        await attemptRepository.expireAttemptIfActive(
          lockedAttempt.id,
          now,
          tx
        );

        throw new ConflictError(
          "Assessment attempt has expired.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_EXPIRED
        );
      }

      /**
       * ------------------------------------------------------
       * 8. Load complete immutable evaluation dataset
       * ------------------------------------------------------
       */
      const attempt = await attemptRepository.findAttemptForEvaluation(
        lockedAttempt.id,
        tx
      );

      if (!attempt) {
        throw new NotFoundError(
          "Assessment attempt could not be loaded.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      /**
       * ------------------------------------------------------
       * 9. Evaluate every snapshot question
       * ------------------------------------------------------
       */
      const evaluations = attempt.questions.map((attemptQuestion) => ({
        attemptQuestion,
        ...this.evaluateAttemptQuestion({
          attemptQuestion,
        }),
      }));

      /**
       * ------------------------------------------------------
       * 10. Calculate score
       * ------------------------------------------------------
       */
      const score = this.calculateAttemptScore(evaluations);

      /**
       * ------------------------------------------------------
       * 11. Percentage
       * ------------------------------------------------------
       */
      const maximumScore = Number(attempt.assessment.maximumScore);

      const percentage =
        maximumScore > 0 ? (score.finalScore / maximumScore) * 100 : 0;

      const normalizedPercentage = Math.min(
        100,
        Math.max(0, percentage)
      );

      /**
       * ------------------------------------------------------
       * 12. Pass / Fail
       * ------------------------------------------------------
       */
      const result = this.determineResult({
        finalScore: score.finalScore,
        passingScore: attempt.assessment.passingScore,
      });

      /**
       * ------------------------------------------------------
       * 13. Persist answer evaluation
       * ------------------------------------------------------
       */
      for (const evaluation of evaluations) {
        await attemptRepository.persistAnswerEvaluation(
          {
            answerId: evaluation.attemptQuestion.answers?.[0]?.id,
            evaluationStatus: evaluation.status,
            marksAwarded:
              evaluation.positiveMarks - evaluation.negativeMarks,
            isCorrect: evaluation.isCorrect,
          },
          tx
        );
      }

      /**
       * ------------------------------------------------------
       * 14. Atomic final state transition
       * ------------------------------------------------------
       */
      const submitted = await attemptRepository.submitAttempt(
        {
          attemptId: attempt.id,
          score: score.finalScore,
          percentage: Number(normalizedPercentage.toFixed(2)),
          passed: result === ATTEMPT_RESULT_STATUS.PASSED,
          submittedAt: now,
        },
        tx
      );

      if (!submitted || (submitted.count !== undefined && submitted.count === 0)) {
        throw new ConflictError(
          "Assessment attempt was submitted by another request.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_ALREADY_SUBMITTED
        );
      }

      /**
       * ------------------------------------------------------
       * 15. Mark invitation completed
       * ------------------------------------------------------
       */
      await attemptRepository.markInvitationCompleted(
        invitation.id,
        tx
      );

      /**
       * ------------------------------------------------------
       * 16. Return server-generated result
       * ------------------------------------------------------
       */
      return {
        attemptId: attempt.id,
        status: "SUBMITTED",
        submittedAt: now,
        positiveMarks: score.positiveMarks,
        negativeMarks: score.negativeMarks,
        finalScore: score.finalScore,
        maximumScore,
        percentage: Number(normalizedPercentage.toFixed(2)),
        passingScore: Number(attempt.assessment.passingScore),
        result,
        correctCount: score.correctCount,
        incorrectCount: score.incorrectCount,
        unansweredCount: score.unansweredCount,
      };
    });
  }

  async submitAttempt(payload) {
    return this.submitAttemptByToken(payload);
  }

  /**
   * ------------------------------------------------------------
   * Get Paginated Assessment Results for HR Dashboard
   * ------------------------------------------------------------
   */
  async getAssessmentResults({ assessmentId, query, user }) {
    const assessment = await assertAssessmentResultAccess({
      assessmentId,
      user,
    });

    const {
      page = 1,
      limit = 10,
      search,
      status,
      passed,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query || {};

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = {
      assessmentId,
    };

    if (status) {
      where.status = status;
    }

    if (typeof passed === "boolean") {
      where.passed = passed;
    }

    if (search) {
      where.candidate = {
        OR: [
          {
            firstName: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      };
    }

    let orderBy;

    if (sortBy === "candidateName") {
      orderBy = [
        {
          candidate: {
            firstName: sortOrder,
          },
        },
        {
          candidate: {
            lastName: sortOrder,
          },
        },
      ];
    } else if (sortBy === "candidateEmail") {
      orderBy = {
        candidate: {
          email: sortOrder,
        },
      };
    } else {
      orderBy = {
        [sortBy]: sortOrder,
      };
    }

    const [attempts, total] = await Promise.all([
      attemptRepository.listAssessmentResults({
        where,
        skip,
        take: limitNum,
        orderBy,
      }),
      attemptRepository.countAssessmentResults(where),
    ]);

    return {
      assessment,

      data: attempts.map(attemptDto.toHrResultListItem),

      meta: {
        total,

        page,

        limit,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * ------------------------------------------------------------
   * Get Assessment Analytics for HR Dashboard
   * ------------------------------------------------------------
   */
  async getAssessmentAnalytics({ assessmentId, user }) {
    const assessment = await assertAssessmentResultAccess({
      assessmentId,
      user,
    });

    const baseWhere = {
      assessmentId,
    };

    const submittedWhere = {
      assessmentId,
      status: "SUBMITTED",
    };

    const [statusCounts, scoreAggregate, passFail, questionRows] =
      await Promise.all([
        attemptRepository.countAttemptsByStatus(baseWhere),

        attemptRepository.aggregateSubmittedScores(submittedWhere),

        attemptRepository.countPassedAttempts(submittedWhere),

        attemptRepository.getQuestionPerformance(assessmentId),
      ]);

    const analytics = attemptDto.toHrAnalyticsResponse({
      assessment,

      statusCounts,

      scoreAggregate,

      passFail,
    });

    return {
      ...analytics,

      questionPerformance:
        attemptDto.toQuestionPerformanceResponse(questionRows),
    };
  }

  /**
   * ------------------------------------------------------------
   * Get Detailed Candidate Attempt Result for HR
   * ------------------------------------------------------------
   */
  async getAttemptResultDetail({ assessmentId, attemptId, user }) {
    await assertAssessmentResultAccess({
      assessmentId,
      user,
    });

    const attempt = await attemptRepository.findAttemptResultDetail({
      assessmentId,
      attemptId,
    });

    if (!attempt) {
      throw createServiceError(
        ATTEMPT_RESULT_ERROR_CODES.ATTEMPT_NOT_FOUND,
        "Assessment attempt not found.",
        404
      );
    }

    return attemptDto.toHrAttemptResultResponse(attempt);
  }

  /**
   * ------------------------------------------------------------
   * Send Candidate Email OTP
   * ------------------------------------------------------------
   */
  async sendCandidateOtp({ email, invitationToken, now = new Date(), emailService, invitationRepository }, tx) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Validate invitation token
    const invRepo = invitationRepository || attemptRepository;
    let invitation;
    try {
      if (typeof invRepo.findUsableByToken === "function") {
        invitation = await invRepo.findUsableByToken(invitationToken, tx);
      } else {
        invitation = await this.findInvitationByRawToken(invitationToken, tx);
      }
    } catch (err) {
      throw new BadRequestError(
        "Unable to process verification request.",
        "INVALID_INVITATION"
      );
    }

    if (!invitation) {
      throw new BadRequestError(
        "Unable to process verification request.",
        "INVALID_INVITATION"
      );
    }

    const invitationEmail = (invitation.email || invitation.candidate?.email || "").toLowerCase();

    if (!invitationEmail || invitationEmail !== normalizedEmail) {
      throw new BadRequestError(
        "Unable to process verification request.",
        "INVALID_INVITATION"
      );
    }

    // 2. 60-second cooldown check
    const cooldownStart = new Date(now.getTime() - OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000);
    const recentOtp = await attemptRepository.findRecentCandidateOtp(
      {
        email: normalizedEmail,
        purpose: OTP_PURPOSE.ASSESSMENT_VERIFICATION,
        since: cooldownStart,
        now,
      },
      tx
    );

    if (recentOtp) {
      const elapsedSeconds = Math.floor((now.getTime() - recentOtp.createdAt.getTime()) / 1000);
      const remainingSeconds = Math.max(0, OTP_CONFIG.RESEND_COOLDOWN_SECONDS - elapsedSeconds);

      const error = new AppError({
        message: "Please wait before requesting another OTP.",
        statusCode: 429,
        errorCode: OTP_ERROR_CODES.OTP_COOLDOWN,
      });
      error.retryAfterSeconds = remainingSeconds;
      throw error;
    }

    // 3. Hourly rate limit check (5 requests/hour)
    const hourlyLimitStart = new Date(now.getTime() - 3600 * 1000);
    const hourlyCount = await attemptRepository.countCandidateOtpRequests(
      {
        email: normalizedEmail,
        purpose: OTP_PURPOSE.ASSESSMENT_VERIFICATION,
        since: hourlyLimitStart,
        now,
      },
      tx
    );

    if (hourlyCount >= OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
      throw new AppError({
        message: "Too many OTP requests. Please try again later.",
        statusCode: 429,
        errorCode: OTP_ERROR_CODES.OTP_RATE_LIMITED,
      });
    }

    // 4. Generate cryptographically secure OTP & hash
    const otp = generateNumericOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = createOtpExpiryDate(now);

    // 5. Save hashed OTP to database
    await attemptRepository.createCandidateOtp(
      {
        email: normalizedEmail,
        otpHash,
        purpose: OTP_PURPOSE.ASSESSMENT_VERIFICATION,
        maxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
        expiresAt,
      },
      tx
    );

    // 6. Send email (using emailService or default sendEmail with Brevo transport)
    try {
      if (emailService && typeof emailService.sendCandidateOtp === "function") {
        await emailService.sendCandidateOtp({
          email: normalizedEmail,
          otp,
          expiresAt,
        });
      } else {
        const emailContent = buildCandidateOtpEmail({ otp, expiresAt });
        await sendEmail({
          to: normalizedEmail,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });
      }
    } catch (err) {
      const error = new AppError({
        message: "OTP email delivery failed.",
        statusCode: 502,
        errorCode: "OTP_EMAIL_DELIVERY_FAILED",
      });
      error.cause = err;
      throw error;
    }

    return {
      cooldownSeconds: OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
      expiresAt,
    };
  }

  /**
   * ------------------------------------------------------------
   * Verify Candidate Email OTP
   * ------------------------------------------------------------
   */
  async verifyCandidateOtp({ email, otp, invitationToken, now = new Date(), invitationRepository }, tx) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Validate invitation token
    const invRepo = invitationRepository || attemptRepository;
    let invitation;
    try {
      if (typeof invRepo.findUsableByToken === "function") {
        invitation = await invRepo.findUsableByToken(invitationToken, tx);
      } else {
        invitation = await this.findInvitationByRawToken(invitationToken, tx);
      }
    } catch (err) {
      throw new BadRequestError(
        "Invalid verification request.",
        "INVALID_INVITATION"
      );
    }

    if (!invitation) {
      throw new BadRequestError(
        "Invalid verification request.",
        "INVALID_INVITATION"
      );
    }

    const invitationEmail = (invitation.email || invitation.candidate?.email || "").toLowerCase();

    if (!invitationEmail || invitationEmail !== normalizedEmail) {
      throw new BadRequestError(
        "Invalid verification request.",
        "INVALID_INVITATION"
      );
    }

    // 2. Find active OTP
    const otpRecord = await attemptRepository.findLatestCandidateOtp(
      {
        email: normalizedEmail,
        purpose: OTP_PURPOSE.ASSESSMENT_VERIFICATION,
        now,
      },
      tx
    );

    if (!otpRecord) {
      throw new BadRequestError(
        "Invalid or expired OTP.",
        OTP_ERROR_CODES.OTP_NOT_FOUND
      );
    }

    // 3. Expiry check
    if (isOtpExpired(otpRecord.expiresAt, now)) {
      await attemptRepository.invalidateCandidateOtp({ id: otpRecord.id, now }, tx);
      throw new BadRequestError(
        "OTP has expired. Please request a new code.",
        OTP_ERROR_CODES.OTP_EXPIRED
      );
    }

    // 4. Maximum attempt protection check
    if (hasExceededOtpAttempts(otpRecord.attemptsCount, otpRecord.maxAttempts)) {
      await attemptRepository.invalidateCandidateOtp({ id: otpRecord.id, now }, tx);
      throw new AppError({
        message: "Maximum invalid attempts exceeded.",
        statusCode: 429,
        errorCode: OTP_ERROR_CODES.OTP_MAX_ATTEMPTS,
      });
    }

    // 5. Constant-time hash comparison
    const isValid = verifyOtpHash(otp, otpRecord.otpHash);

    // 6. Wrong OTP handling
    if (!isValid) {
      const updated = await attemptRepository.incrementOtpAttempts({ id: otpRecord.id, now }, tx);

      if (typeof updated === "object" && updated.count === 0) {
        throw new BadRequestError(
          "Invalid or expired OTP.",
          OTP_ERROR_CODES.OTP_NOT_FOUND
        );
      }

      const attemptsUsed = otpRecord.attemptsCount + 1;
      const attemptsRemaining = Math.max(0, otpRecord.maxAttempts - attemptsUsed);

      if (attemptsRemaining === 0) {
        await attemptRepository.invalidateCandidateOtp({ id: otpRecord.id, now }, tx);
      }

      if (attemptsRemaining > 0) {
        throw new BadRequestError(
          `Invalid OTP code. ${attemptsRemaining} attempts remaining.`,
          OTP_ERROR_CODES.INVALID_OTP
        );
      } else {
        throw new AppError({
          message: "Maximum invalid attempts exceeded.",
          statusCode: 429,
          errorCode: OTP_ERROR_CODES.OTP_MAX_ATTEMPTS,
        });
      }
    }

    // 7. Atomically consume OTP
    const verified = await attemptRepository.markCandidateOtpVerified(
      {
        id: otpRecord.id,
        verifiedAt: now,
        now,
      },
      tx
    );

    if (typeof verified === "object" && verified.count !== 1) {
      throw new ConflictError(
        "OTP has already been used or expired.",
        OTP_ERROR_CODES.OTP_ALREADY_VERIFIED
      );
    }

    // 8. Create short-lived verification access session
    const candidateAccessToken = generateVerificationSessionToken();
    const sessionTokenHash = hashVerificationSessionToken(candidateAccessToken);
    const sessionExpiresAt = createVerificationSessionExpiryDate(now);

    await attemptRepository.createVerificationSession(
      {
        candidateId: invitation.candidateId,
        assessmentId: invitation.assessmentId,
        candidateAssessmentId: invitation.candidateAssessmentId || invitation.id,
        tokenHash: sessionTokenHash,
        expiresAt: sessionExpiresAt,
      },
      tx
    );

    return {
      verified: true,
      candidateAccessToken,
      candidateAssessmentId: invitation.candidateAssessmentId || invitation.id,
      assessmentId: invitation.assessmentId,
      candidateId: invitation.candidateId,
      expiresAt: sessionExpiresAt,
      verifiedAt: now,
    };
  }

  /**
   * Get Current Active Candidate Assessment Attempt
   */
  async getCurrentCandidateAttempt({ candidateAssessmentId, candidateSession, token, now = new Date() }) {
    const effectiveCandidateAssessmentId = candidateSession?.candidateAssessmentId || candidateAssessmentId;
    const effectiveCandidateId = candidateSession?.candidateId;
    const effectiveAssessmentId = candidateSession?.assessmentId;

    const hasSessionOrAssessment = Boolean(
      effectiveCandidateAssessmentId || (effectiveCandidateId && effectiveAssessmentId)
    );

    if (!hasSessionOrAssessment && !token) {
      throw unauthorized("Candidate verification session or token is required.", "INVALID_CANDIDATE_SESSION");
    }

    let attempt = null;

    if (hasSessionOrAssessment) {
      attempt = await attemptRepository.findCurrentAttempt({
        candidateAssessmentId: effectiveCandidateAssessmentId,
        candidateId: effectiveCandidateId,
        assessmentId: effectiveAssessmentId,
      });
    }

    if (!attempt && token) {
      const tokenHash = attemptMapper.hashInvitationToken(token.trim());
      const invitation = await attemptRepository.findInvitationByTokenHash(tokenHash);
      if (invitation) {
        attempt = await attemptRepository.findActiveAttempt({
          assessmentId: invitation.assessmentId,
          candidateId: invitation.candidateId,
        });
      }
    }

    if (!attempt) {
      return null;
    }

    if (attempt.expiresAt && attempt.expiresAt <= now && attempt.status === "IN_PROGRESS") {
      await this.expireAttempt({
        attemptId: attempt.id,
        now,
      });

      return {
        expired: true,
        attemptId: attempt.id,
        status: "EXPIRED",
        attempt,
      };
    }

    return {
      expired: false,
      attempt,
    };
  }

  /**
   * Real-Time Candidate Answer Autosave Workflow
   */
  async saveCandidateAnswer({
    candidateAssessmentId,
    candidateSession,
    token,
    attemptQuestionId,
    questionId,
    selectedOptionIds,
    answerText,
    version: expectedVersion,
    now = new Date(),
  }) {
    const effectiveCandidateAssessmentId = candidateSession?.candidateAssessmentId || candidateAssessmentId;
    const effectiveCandidateId = candidateSession?.candidateId;
    const effectiveAssessmentId = candidateSession?.assessmentId;

    const hasSessionOrAssessment = Boolean(
      effectiveCandidateAssessmentId || (effectiveCandidateId && effectiveAssessmentId)
    );

    if (!hasSessionOrAssessment && !token) {
      throw new UnauthorizedError(
        "Candidate verification session or token is required.",
        "INVALID_CANDIDATE_SESSION"
      );
    }

    let attempt = null;

    if (hasSessionOrAssessment) {
      if (effectiveCandidateAssessmentId) {
        attempt = await attemptRepository.findAttemptById(effectiveCandidateAssessmentId);
      }
      if (!attempt) {
        attempt = await attemptRepository.findCurrentAttempt({
          candidateAssessmentId: effectiveCandidateAssessmentId,
          candidateId: effectiveCandidateId,
          assessmentId: effectiveAssessmentId,
        });
      }
    }

    if (!attempt && token) {
      const tokenHash = attemptMapper.hashInvitationToken(token.trim());
      const invitation = await attemptRepository.findInvitationByTokenHash(tokenHash);
      if (invitation) {
        attempt = await attemptRepository.findActiveAttempt({
          assessmentId: invitation.assessmentId,
          candidateId: invitation.candidateId,
        });
      }
    }

    if (!attempt) {
      throw new NotFoundError(
        "No active assessment attempt found.",
        "ACTIVE_ATTEMPT_NOT_FOUND"
      );
    }

    if (attempt.status !== "IN_PROGRESS") {
      throw new ConflictError(
        "Answers can only be saved while the attempt is in progress.",
        "ATTEMPT_NOT_ACTIVE"
      );
    }

    if (attempt.expiresAt && attempt.expiresAt <= now) {
      await attemptRepository.expireAttemptIfActive({ id: attempt.id, now });
      throw new ConflictError(
        "Assessment attempt has expired.",
        "ATTEMPT_EXPIRED"
      );
    }

    const attemptQuestion = await attemptRepository.findAttemptQuestion({
      id: attemptQuestionId,
      questionId,
      attemptId: attempt.id,
    });

    if (!attemptQuestion) {
      throw new NotFoundError(
        "Attempt question was not found for this candidate attempt.",
        "ATTEMPT_QUESTION_NOT_FOUND"
      );
    }

    const question = attemptQuestion.question || {};
    const hasOptions = Array.isArray(selectedOptionIds);
    const hasText = typeof answerText === "string" && answerText.length > 0;
    const isObjective = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(question.type);

    if (isObjective && !hasOptions) {
      throw new BadRequestError("This objective question requires option selection.", "OPTIONS_REQUIRED");
    }

    if (!isObjective && !hasText) {
      throw new BadRequestError("This subjective question requires a text answer.", "TEXT_ANSWER_REQUIRED");
    }

    if (hasOptions && question.options && question.options.length > 0) {
      const validOptionIds = new Set(question.options.map((opt) => opt.id));
      const uniqueIds = new Set(selectedOptionIds);

      if (uniqueIds.size !== selectedOptionIds.length) {
        throw new BadRequestError("Duplicate option selections are not allowed.", "DUPLICATE_OPTIONS");
      }

      const invalidOption = selectedOptionIds.find((id) => !validOptionIds.has(id));
      if (invalidOption) {
        throw new BadRequestError("One or more selected options are invalid for this question.", "INVALID_OPTIONS");
      }

      if ((question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") && selectedOptionIds.length !== 1) {
        throw new BadRequestError("Single choice questions require exactly one selected option.", "INVALID_OPTION_COUNT");
      }
    }

    const targetQuestionId = attemptQuestion.questionId;
    const payloadOptionIds = hasOptions ? selectedOptionIds : null;
    const payloadText = hasText ? answerText : null;

    let answer = await attemptRepository.findAttemptAnswer({
      attemptId: attempt.id,
      questionId: targetQuestionId,
    });

    if (!answer) {
      try {
        answer = await attemptRepository.createAttemptAnswer({
          attemptId: attempt.id,
          questionId: targetQuestionId,
          selectedOptionIds: payloadOptionIds,
          answerText: payloadText,
        });
        return {
          attemptId: attempt.id,
          questionId: targetQuestionId,
          attemptQuestionId: attemptQuestion.id,
          version: answer.version || 1,
          savedAt: answer?.updatedAt || answer?.answeredAt || now,
          status: attempt.status,
        };
      } catch (err) {
        if (err?.code !== "P2002") {
          throw err;
        }
        answer = await attemptRepository.findAttemptAnswer({
          attemptId: attempt.id,
          questionId: targetQuestionId,
        });
      }
    }

    if (!answer) {
      throw new ConflictError(
        "Unable to resolve answer state.",
        "ANSWER_STATE_UNAVAILABLE"
      );
    }

    if (expectedVersion !== undefined && expectedVersion !== null && answer.version !== expectedVersion) {
      throw new ConflictError(
        "This answer is outdated. Please refresh the current answer before saving again.",
        "ANSWER_VERSION_CONFLICT",
        { currentVersion: answer.version }
      );
    }

    const updatedCount = await attemptRepository.updateAnswerWithVersion({
      answerId: answer.id,
      expectedVersion: expectedVersion !== undefined ? expectedVersion : answer.version,
      selectedOptionIds: payloadOptionIds,
      answerText: payloadText,
    });

    if (updatedCount !== 1) {
      const latest = await attemptRepository.findAttemptAnswerById({ answerId: answer.id });
      throw new ConflictError(
        "This answer was modified by another request.",
        "ANSWER_VERSION_CONFLICT",
        { currentVersion: latest?.version || answer.version }
      );
    }

    const updatedAnswer = await attemptRepository.findAttemptAnswerById({ answerId: answer.id });

    return {
      attemptId: attempt.id,
      questionId: targetQuestionId,
      attemptQuestionId: attemptQuestion.id,
      version: updatedAnswer?.version || answer.version + 1,
      savedAt: updatedAnswer?.updatedAt || now,
      status: attempt.status,
    };
  }

  /**
   * Submit Candidate Assessment Attempt Workflow (Verification Session Integrated)
   */
  async submitCandidateAttempt({ candidateAssessmentId, candidateSession, token, now = new Date() }) {
    const effectiveCandidateAssessmentId = candidateAssessmentId || candidateSession?.candidateAssessmentId || candidateSession?.candidateAttemptId;
    const sessionId = candidateSession?.sessionId;

    if (!effectiveCandidateAssessmentId && !token) {
      throw new UnauthorizedError(
        "Candidate verification session or token is required.",
        "INVALID_CANDIDATE_SESSION"
      );
    }

    if (token && !effectiveCandidateAssessmentId) {
      return this.submitAttemptByToken({ token });
    }

    return attemptRepository.transaction(async (tx) => {
      let currentAttempt = await attemptRepository.findAttemptById(effectiveCandidateAssessmentId, tx);
      if (!currentAttempt) {
        currentAttempt = await attemptRepository.findCurrentAttempt({
          candidateAssessmentId: effectiveCandidateAssessmentId,
        }, tx);
      }

      if (!currentAttempt) {
        throw new NotFoundError(
          "No active assessment attempt found.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      const lockedAttempt = await attemptRepository.lockAttemptRow(currentAttempt.id, tx);
      if (!lockedAttempt) {
        throw new NotFoundError(
          "Assessment attempt could not be locked.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      if (lockedAttempt.status === "SUBMITTED") {
        return {
          alreadySubmitted: true,
          attemptId: lockedAttempt.id,
          status: "SUBMITTED",
          submittedAt: lockedAttempt.submittedAt,
          score: Number(lockedAttempt.score || 0),
          percentage: Number(lockedAttempt.percentage || 0),
          passed: Boolean(lockedAttempt.passed),
        };
      }

      if (lockedAttempt.status !== "IN_PROGRESS") {
        throw new ConflictError(
          "Assessment attempt cannot be submitted in its current state.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_SUBMITTABLE
        );
      }

      if (lockedAttempt.expiresAt <= now) {
        await attemptRepository.expireAttemptIfActive(lockedAttempt.id, now, tx);
        throw new ConflictError(
          "Assessment attempt has expired.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_EXPIRED
        );
      }

      const attempt = await attemptRepository.findAttemptForEvaluation(lockedAttempt.id, tx);
      if (!attempt) {
        throw new NotFoundError(
          "Assessment attempt could not be loaded for evaluation.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_NOT_FOUND
        );
      }

      let correctCount = 0;
      let incorrectCount = 0;
      let unansweredCount = 0;

      const evaluations = attempt.questions.map((attemptQuestion) => {
        const evalResult = this.evaluateAttemptQuestion({ attemptQuestion });
        if (evalResult.status === ATTEMPT_EVALUATION_STATUS.CORRECT) {
          correctCount += 1;
        } else if (evalResult.status === ATTEMPT_EVALUATION_STATUS.INCORRECT) {
          incorrectCount += 1;
        } else {
          unansweredCount += 1;
        }
        return {
          attemptQuestion,
          ...evalResult,
        };
      });

      const score = this.calculateAttemptScore(evaluations);
      const maximumScore = Number(attempt.assessment.maximumScore);
      const percentage = maximumScore > 0 ? (score.finalScore / maximumScore) * 100 : 0;
      const normalizedPercentage = Math.min(100, Math.max(0, percentage));

      const result = this.determineResult({
        finalScore: score.finalScore,
        passingScore: attempt.assessment.passingScore,
      });

      for (const evaluation of evaluations) {
        await attemptRepository.persistAnswerEvaluation(
          {
            answerId: evaluation.attemptQuestion.answers?.[0]?.id,
            evaluationStatus: evaluation.status,
            marksAwarded: evaluation.positiveMarks - evaluation.negativeMarks,
            isCorrect: evaluation.isCorrect,
          },
          tx
        );
      }

      const submitted = await attemptRepository.submitAttempt(
        {
          attemptId: attempt.id,
          score: score.finalScore,
          percentage: Number(normalizedPercentage.toFixed(2)),
          passed: result === ATTEMPT_RESULT_STATUS.PASSED,
          submittedAt: now,
        },
        tx
      );

      if (!submitted || (submitted.count !== undefined && submitted.count === 0)) {
        throw new ConflictError(
          "Assessment attempt was submitted by another request.",
          ATTEMPT_SUBMIT_ERROR_CODES.ATTEMPT_ALREADY_SUBMITTED
        );
      }

      if (sessionId) {
        await attemptRepository.revokeVerificationSession({ id: sessionId, revokedAt: now }, tx);
      }

      return {
        alreadySubmitted: false,
        attemptId: attempt.id,
        status: "SUBMITTED",
        submittedAt: now,
        score: score.finalScore,
        maximumScore,
        percentage: Number(normalizedPercentage.toFixed(2)),
        passed: result === ATTEMPT_RESULT_STATUS.PASSED,
        correctCount,
        incorrectCount,
        unansweredCount,
      };
    });
  }

  /**
   * Manual Subjective Answer Evaluation Workflow (HR / Super Admin)
   */
  async evaluateCandidateAnswer({ attemptId, attemptAnswerId, evaluationStatus, marksAwarded, evaluator }) {
    if (!evaluator || (evaluator.role !== "SUPER_ADMIN" && evaluator.role !== "HR")) {
      throw new ForbiddenError(
        "You do not have permission to evaluate this assessment attempt.",
        "ACCESS_DENIED"
      );
    }

    return attemptRepository.transaction(async (tx) => {
      const answer = await attemptRepository.findAnswerForEvaluation({ attemptAnswerId }, tx);
      if (!answer) {
        throw new NotFoundError(
          "Attempt answer was not found.",
          "ATTEMPT_ANSWER_NOT_FOUND"
        );
      }

      const attempt = answer.attempt;

      if (attemptId && attempt.id !== attemptId) {
        throw new ForbiddenError(
          "Attempt answer does not belong to the specified assessment attempt.",
          "ATTEMPT_SCOPE_MISMATCH"
        );
      }

      if (attempt.status !== "SUBMITTED") {
        throw new ConflictError(
          "Only submitted assessment attempts can be evaluated.",
          "INVALID_ATTEMPT_STATE"
        );
      }

      const question = await attemptRepository.findAttemptQuestionByAnswer({ attemptAnswerId }, tx);
      const questionMaxMarks = question ? Number(question.marks) : 100000;

      if (Number(marksAwarded) > questionMaxMarks) {
        throw new BadRequestError(
          `Awarded marks (${marksAwarded}) cannot exceed question max marks (${questionMaxMarks}).`,
          "MARKS_EXCEED_QUESTION_LIMIT"
        );
      }

      await attemptRepository.evaluateAttemptAnswer(
        {
          id: attemptAnswerId,
          evaluationStatus,
          marksAwarded: Number(marksAwarded),
        },
        tx
      );

      const answers = await attemptRepository.findAttemptAnswersForRecalculation(
        { attemptId: attempt.id },
        tx
      );

      const totalScore = answers.reduce((total, item) => total + Number(item.marksAwarded || 0), 0);
      const maximumScore = Number(attempt.assessment.maximumScore);
      const finalScore = Math.min(Math.max(totalScore, 0), maximumScore);

      const percentage = maximumScore > 0 ? (finalScore / maximumScore) * 100 : 0;
      const normalizedPercentage = Math.min(100, Math.max(0, percentage));
      const passed = finalScore >= Number(attempt.assessment.passingScore);

      await attemptRepository.updateAttemptEvaluation(
        {
          id: attempt.id,
          score: finalScore,
          percentage: Number(normalizedPercentage.toFixed(2)),
          passed,
        },
        tx
      );

      return {
        attemptId: attempt.id,
        attemptAnswerId,
        evaluationStatus,
        marksAwarded: Number(marksAwarded),
        score: finalScore,
        maximumScore,
        percentage: Number(normalizedPercentage.toFixed(2)),
        passed,
        evaluatedAt: new Date(),
      };
    });
  }

  /**
   * HR Attempt Results List Workflow (Paginated + Scoped)
   */
  async getHRAttemptResults({ query = {}, user }) {
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "HR")) {
      throw new ForbiddenError(
        "You do not have permission to access HR assessment results.",
        "ACCESS_DENIED"
      );
    }

    const { page = 1, limit = 20, status, search, sortBy = "createdAt", sortOrder = "desc" } = query;
    const skip = (page - 1) * limit;

    const where = {};
    if (user.role === "HR") {
      where.assessment = { createdById: user.id };
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.candidate = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const allowedSortFields = {
      startedAt: "startedAt",
      createdAt: "startedAt",
      submittedAt: "submittedAt",
      score: "score",
      percentage: "percentage",
    };
    const orderBy = {
      [allowedSortFields[sortBy] || "startedAt"]: sortOrder === "asc" ? "asc" : "desc",
    };

    const [items, total] = await Promise.all([
      attemptRepository.listAttemptsForHR({ where, skip, take: limit, orderBy }),
      attemptRepository.countAttemptsForHR({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * HR Assessment Real-Time Analytics Dashboard Workflow
   */
  async getAssessmentDashboard({ assessmentId, query = {}, user }) {
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "HR")) {
      throw new ForbiddenError(
        "You do not have permission to access assessment analytics.",
        "ACCESS_DENIED"
      );
    }

    const analytics = await attemptRepository.getAssessmentAnalytics({
      assessmentId,
      from: query.from,
      to: query.to,
    });

    const { totalAttempts, submittedAttempts, passedAttempts, failedAttempts, scoreAggregate } = analytics;
    const completionRate = totalAttempts > 0 ? (submittedAttempts / totalAttempts) * 100 : 0;
    const passRate = submittedAttempts > 0 ? (passedAttempts / submittedAttempts) * 100 : 0;

    return {
      attempts: {
        total: totalAttempts,
        submitted: submittedAttempts,
        completionRate: Number(completionRate.toFixed(2)),
      },
      results: {
        passed: passedAttempts,
        failed: failedAttempts,
        passRate: Number(passRate.toFixed(2)),
      },
      scores: {
        average: Number(scoreAggregate._avg?.score || 0),
        averagePercentage: Number(scoreAggregate._avg?.percentage || 0),
        highest: Number(scoreAggregate._max?.score || 0),
        lowest: Number(scoreAggregate._min?.score || 0),
      },
    };
  }

  /**
   * HR Attempt Detail Review Workflow
   */
  async getHRAttemptDetail({ attemptId, user }) {
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "HR")) {
      throw new ForbiddenError(
        "You do not have permission to access attempt details.",
        "ACCESS_DENIED"
      );
    }

    const attempt = await attemptRepository.findAttemptForHR({ attemptId });
    if (!attempt) {
      throw new NotFoundError(
        "Assessment attempt was not found.",
        "ATTEMPT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && attempt.assessment?.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have permission to access this assessment attempt.",
        "ACCESS_DENIED"
      );
    }

    return attempt;
  }

  /**
   * ------------------------------------------------------------
   * Candidate Attempt Expiry & Auto-Finalization Workflow
   * ------------------------------------------------------------
   */
  /**
   * Universal Attempt Evaluator (Reuses Step 14 Evaluation Engine)
   */
  async evaluateAttempt({ attempt, tx, mode = "SUBMIT" }) {
    const fullAttempt = (await attemptRepository.findAttemptById(
      attempt.id,
      { includeQuestions: true, includeAnswers: true },
      tx
    )) || attempt;

    const questions = fullAttempt.attemptQuestions || fullAttempt.questions || [];
    const evaluations = questions.map((attemptQuestion) => ({
      attemptQuestion,
      answerId: attemptQuestion.answers?.[0]?.id,
      ...this.evaluateAttemptQuestion({ attemptQuestion }),
    }));

    const scoreObj = this.calculateAttemptScore(evaluations);
    const finalScore = scoreObj.finalScore || 0;
    const maxScore = Number(fullAttempt.maxScore || fullAttempt.assessment?.maximumScore || 100);
    const rawPercentage = maxScore > 0 ? (finalScore / maxScore) * 100 : 0;
    const percentage = Math.min(100, Math.max(0, rawPercentage));

    const passingScore = Number(fullAttempt.assessment?.passingScore || 50);
    const result = this.determineResult({ finalScore, passingScore });
    const passed = result === ATTEMPT_RESULT_STATUS.PASSED;

    return {
      score: finalScore,
      maxScore,
      percentage: Number(percentage.toFixed(2)),
      passed,
      result,
      evaluations,
      mode,
    };
  }

  async evaluateExpiredAttempt({ attempt, tx }) {
    return this.evaluateAttempt({
      attempt,
      tx,
      mode: "EXPIRY",
    });
  }

  async expireAttempt({ attemptId }) {
    return runTransaction(
      async (tx) => {
        const attempt = await attemptRepository.lockAttemptForExpiry(
          { attemptId },
          tx
        );

        if (!attempt) {
          return {
            processed: false,
            reason: "NOT_FOUND",
          };
        }

        if (attempt.status !== "IN_PROGRESS") {
          return {
            processed: false,
            reason: "ALREADY_FINALIZED",
          };
        }

        const now = new Date();

        if (now < attempt.expiresAt) {
          return {
            processed: false,
            reason: "NOT_EXPIRED",
          };
        }

        const result = await this.evaluateExpiredAttempt({ attempt, tx });

        // Step 33 & 36: Persist answer-level evaluations inside the same transaction BEFORE marking EXPIRED
        if (Array.isArray(result.evaluations)) {
          for (const ev of result.evaluations) {
            if (ev.answerId) {
              await attemptRepository.evaluateAttemptAnswer(
                {
                  id: ev.answerId,
                  isCorrect: Boolean(ev.isCorrect),
                  marksObtained: Number(ev.positiveMarks || ev.score || 0),
                  evaluationStatus: ev.status || "UNANSWERED",
                  marksAwarded: Number(ev.positiveMarks || ev.score || 0),
                },
                tx
              );
            }
          }
        }

        await attemptRepository.markAttemptExpired(
          {
            attemptId: attempt.id,
            expiredAt: now,
            score: result.score,
            percentage: result.percentage,
            passed: result.passed,
          },
          tx
        );

        return {
          processed: true,
          attemptId: attempt.id,
          status: "EXPIRED",
          result,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );
  }
}

const attemptService = new AttemptService();
module.exports = attemptService;
module.exports.expireAttempt = attemptService.expireAttempt.bind(attemptService);

