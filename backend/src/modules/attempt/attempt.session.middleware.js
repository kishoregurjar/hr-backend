"use strict";

const { AppError } = require("../../utils/app-error");
const { hashVerificationSessionToken } = require("./attempt.session");
const { findActiveVerificationSession, touchVerificationSession } = require("./attempt.repository");
const { VERIFICATION_SESSION_ERROR_CODES } = require("./attempt.constants");

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
    const token = extractBearerToken(req.headers?.authorization);

    if (!token) {
      throw createSessionError(
        "Candidate verification is required.",
        VERIFICATION_SESSION_ERROR_CODES.INVALID_SESSION,
        401
      );
    }

    /*
     * Raw token is NEVER logged.
     */
    let tokenHash;
    try {
      tokenHash = hashVerificationSessionToken(token);
    } catch (hashErr) {
      throw createSessionError(
        "Candidate verification session is invalid.",
        VERIFICATION_SESSION_ERROR_CODES.INVALID_SESSION,
        401
      );
    }

    const repository = req.app?.locals?.attemptRepository || { findActiveVerificationSession, touchVerificationSession };
    const findSessionFn = repository.findActiveVerificationSession.bind(repository);

    const session = await findSessionFn({
      tokenHash,
      now: new Date(),
    });

    if (!session) {
      throw createSessionError(
        "Candidate verification session is invalid or missing.",
        VERIFICATION_SESSION_ERROR_CODES.SESSION_NOT_FOUND,
        401
      );
    }

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
      try {
        await repository.touchVerificationSession({
          sessionId: session.id,
          now: new Date(),
        });
      } catch (touchErr) {
        // Silent touch update failure to prevent blocking user request
      }
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  extractBearerToken,
  requireCandidateVerification,
};
