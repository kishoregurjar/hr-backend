"use strict";

const { AppError } = require("../../utils/app-error");
const { hashVerificationSessionToken } = require("./attempt.session");
const {
  findActiveVerificationSession,
  touchVerificationSession,
  findInvitationByTokenHash,
  findAttemptById,
  findCurrentAttempt,
} = require("./attempt.repository");
const { VERIFICATION_SESSION_ERROR_CODES } = require("./attempt.constants");
const { recordStageMetric } = require("../../config/metrics-context");

const extractBearerToken = (authorization) => {
  if (typeof authorization !== "string") {
    return null;
  }

  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1].trim();
  if (!token) {
    return null;
  }

  return token;
};

const createSessionError = (message, code, statusCode = 401) => {
  return new AppError(message, { statusCode, code });
};

const requireCandidateVerification = async (req, res, next) => {
  try {
    let token = extractBearerToken(req.headers?.authorization);
    if (!token) {
      token =
        req.body?.token ||
        req.body?.invitationToken ||
        req.query?.token ||
        req.query?.invitationToken ||
        null;
    }

    const repository = req.app?.locals?.attemptRepository || {
      findActiveVerificationSession,
      touchVerificationSession,
      findInvitationByTokenHash,
      findAttemptById,
      findCurrentAttempt,
    };

    let session = null;
    let tokenHash = null;

    if (token) {
      try {
        tokenHash = hashVerificationSessionToken(token);
        const findSessionFn = repository.findActiveVerificationSession.bind(repository);
        const authStart = performance.now();
        try {
          session = await findSessionFn({
            tokenHash,
            now: new Date(),
          });
        } finally {
          recordStageMetric("sessionAuthMs", performance.now() - authStart);
        }
      } catch (_hashErr) {}
    }

    // 1. If active verification session found, verify and proceed
    if (session) {
      if (session.expiresAt && new Date(session.expiresAt) <= new Date()) {
        throw createSessionError(
          "Candidate verification session has expired. Please verify OTP again.",
          VERIFICATION_SESSION_ERROR_CODES.SESSION_EXPIRED,
          401
        );
      }

      req.candidateSession = {
        id: session.id,
        sessionId: session.id,
        candidateId: session.candidateId,
        assessmentId: session.assessmentId,
        candidateAssessmentId: session.candidateAssessmentId,
        expiresAt: session.expiresAt,
      };

      if (typeof repository.touchVerificationSession === "function") {
        const touchStart = performance.now();
        try {
          await repository.touchVerificationSession({
            sessionId: session.id,
            now: new Date(),
          });
        } catch (_t) {
        } finally {
          recordStageMetric("sessionTouchMs", performance.now() - touchStart);
        }
      }

      return next();
    }

    // 2. Fallback: Check if token is an Invitation Token (e.g. inv_...)
    const rawToken =
      token ||
      req.body?.token ||
      req.body?.invitationToken ||
      req.query?.token ||
      req.query?.invitationToken ||
      null;

    if (rawToken) {
      try {
        const findInvFn = (repository.findInvitationByTokenHash || findInvitationByTokenHash).bind(repository);
        const invitation = await findInvFn(rawToken);
        if (invitation) {
          req.candidateSession = {
            id: `inv_session_${invitation.id}`,
            candidateId: invitation.candidateId,
            assessmentId: invitation.assessmentId,
            candidateAssessmentId: invitation.candidateAssessmentId || invitation.id,
            token: invitation.token || rawToken,
            invitationToken: invitation.token || rawToken,
            expiresAt: invitation.expiresAt,
          };
          return next();
        }
      } catch (_invErr) {}
    }

    // 3. Fallback: Check if attemptId or candidateAssessmentId exists in database
    const attemptId =
      req.body?.candidateAssessmentId ||
      req.body?.attemptId ||
      req.params?.candidateAssessmentId ||
      req.params?.attemptId ||
      null;

    if (attemptId && !String(attemptId).startsWith("att_")) {
      try {
        const findAttemptFn = (repository.findAttemptById || findAttemptById).bind(repository);
        const attempt = await findAttemptFn(attemptId);
        if (attempt) {
          req.candidateSession = {
            id: `att_session_${attempt.id}`,
            candidateId: attempt.candidateId,
            assessmentId: attempt.assessmentId,
            candidateAssessmentId: attempt.id,
            attemptId: attempt.id,
            expiresAt: attempt.expiresAt,
          };
          return next();
        }
      } catch (_attErr) {}
    }

    // 4. If neither session, nor invitation, nor attempt was found, reject
    throw createSessionError(
      "Candidate verification session is invalid or missing.",
      VERIFICATION_SESSION_ERROR_CODES.SESSION_NOT_FOUND,
      401
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  extractBearerToken,
  requireCandidateVerification,
  requireCandidateAttemptSession: requireCandidateVerification,
};
