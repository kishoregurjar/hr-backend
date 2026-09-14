"use strict";

const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  UnauthorizedError,
} = require("../../common/errors");
const repository = require("./game.attempt.repository");
const { getGameMetadataBySlug } = require("./game.registry");
const gameSuperAdminService = require("./game.super-admin.service");
const gameService = require("./game.service");
const { mapGameAttemptForCandidate, mapGameResult } = require("./game.attempt.mapper");
const { GAME_ATTEMPT_CONSTANTS } = require("./game.attempt.constants");

function stripSolutionFromPuzzle(puzzleData) {
  if (!puzzleData || typeof puzzleData !== "object") return puzzleData;
  const copy = JSON.parse(JSON.stringify(puzzleData));
  delete copy.solution;
  delete copy.answerKey;
  delete copy.secretSeed;
  return copy;
}

function calculateServerAuthoritativeScore(verification, elapsedMs) {
  if (!verification || !verification.valid) {
    return 0;
  }

  // Server-authoritative scoring logic:
  // Base score for 100% correct solution = 70 points
  // Speed bonus up to 30 points for completing well within max duration (10 mins)
  const maxDurationMs = GAME_ATTEMPT_CONSTANTS.TIME.DEFAULT_GAME_DURATION_MS;
  const timeRatio = Math.min(Math.max(elapsedMs / maxDurationMs, 0), 1);
  const speedBonus = Math.round(30 * (1 - timeRatio));
  const totalScore = 70 + speedBonus;

  return Math.max(
    GAME_ATTEMPT_CONSTANTS.SCORE.MIN,
    Math.min(GAME_ATTEMPT_CONSTANTS.SCORE.MAX, totalScore)
  );
}

class GameAttemptService {
  async startGame({ candidateId, candidateAssessmentId, slug }) {
    if (!candidateId) {
      throw new UnauthorizedError(
        "Candidate authentication required",
        "UNAUTHORIZED"
      );
    }

    // 1. Verify candidate assessment access
    const candidateAssessment = await repository.findCandidateAssessment(
      candidateAssessmentId,
      candidateId
    );

    if (!candidateAssessment) {
      throw new NotFoundError(
        "Candidate assessment not found",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.CANDIDATE_ASSESSMENT_NOT_FOUND
      );
    }

    const assessment = candidateAssessment.assessment;
    const now = new Date();

    if (assessment) {
      if (assessment.startsAt && now < assessment.startsAt) {
        throw new ForbiddenError(
          "Assessment has not started yet",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.CANDIDATE_ASSESSMENT_NOT_AVAILABLE
        );
      }
      if (assessment.endsAt && now > assessment.endsAt) {
        throw new ForbiddenError(
          "Assessment has already ended",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.CANDIDATE_ASSESSMENT_NOT_AVAILABLE
        );
      }
    }

    // 2. Verify Game exists & is active platform-wide
    const metadata = getGameMetadataBySlug(slug);
    if (!metadata) {
      throw new NotFoundError(
        "Game not found",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_NOT_FOUND
      );
    }

    const game = await gameSuperAdminService.getGame(metadata.code || metadata.id);
    if (!game || game.isActive === false) {
      throw new ForbiddenError(
        "This game is currently disabled.",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_DISABLED
      );
    }

    // 3. Verify game attached to assessment
    if (assessment) {
      const assessmentGame = await repository.findAssessmentGame(
        assessment.id,
        game.id
      );
      if (!assessmentGame) {
        throw new ForbiddenError(
          "Game is not attached to this assessment",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_NOT_ATTACHED
        );
      }
    }

    // 4. Verify game not already completed
    const existingResult = await repository.findGameResult(
      candidateAssessmentId,
      game.id
    );
    if (existingResult) {
      throw new ConflictError(
        "Game has already been completed for this assessment",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ALREADY_COMPLETED
      );
    }

    // 5. Reuse active attempt if present
    let attempt = await repository.findActiveAttempt(
      candidateAssessmentId,
      game.id
    );

    if (!attempt || now > attempt.expiresAt) {
      // Generate puzzle state
      const puzzleState = await gameService.generatePuzzle(metadata.slug);

      // Determine expiry time (10 mins default or capped by assessment endsAt)
      const durationMs = GAME_ATTEMPT_CONSTANTS.TIME.DEFAULT_GAME_DURATION_MS;
      let expiresAt = new Date(now.getTime() + durationMs);
      if (assessment && assessment.endsAt && assessment.endsAt < expiresAt) {
        expiresAt = assessment.endsAt;
      }

      attempt = await repository.createAttempt({
        candidateAssessmentId,
        gameId: game.id,
        puzzleState,
        expiresAt,
      });
    }

    const publicPuzzle = stripSolutionFromPuzzle(attempt.puzzleState);
    return mapGameAttemptForCandidate(attempt, game, publicPuzzle, metadata);
  }

  async submitGame({ candidateId, candidateAssessmentId, attemptId, solution }) {
    if (!candidateId) {
      throw new UnauthorizedError(
        "Candidate authentication required",
        "UNAUTHORIZED"
      );
    }

    const attempt = await repository.findAttemptForCandidate(
      attemptId,
      candidateAssessmentId
    );

    if (!attempt) {
      throw new NotFoundError(
        "Game attempt not found",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ATTEMPT_NOT_FOUND
      );
    }

    const now = new Date();

    if (attempt.status !== "IN_PROGRESS") {
      throw new ConflictError(
        "Game attempt is already completed",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ALREADY_COMPLETED
      );
    }

    // Check expiry (allow 10-second max clock skew / latency window)
    const graceMs = GAME_ATTEMPT_CONSTANTS.TIME.MAX_CLOCK_SKEW_MS;
    if (now.getTime() > attempt.expiresAt.getTime() + graceMs) {
      throw new ForbiddenError(
        "Game attempt has expired",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ATTEMPT_EXPIRED
      );
    }

    // Determine game metadata & code
    const game = attempt.game || (await gameSuperAdminService.getGame(attempt.gameId));
    const metadata = getGameMetadataBySlug(game.code || game.id || attempt.gameId);

    // Run Server Verification
    const verification = await gameService.verifySolution(
      metadata ? metadata.slug : game.code,
      solution,
      attempt.puzzleState
    );

    const elapsedMs = Math.max(0, now.getTime() - attempt.startedAt.getTime());
    const score = calculateServerAuthoritativeScore(verification, elapsedMs);

    const metrics = {
      elapsedMs,
      verifiedAt: now.toISOString(),
      valid: verification.valid,
      error: verification.error || null,
    };

    try {
      const submitted = await repository.submitAttempt(attempt.id, score, metrics);
      return mapGameResult(submitted);
    } catch (error) {
      if (error.message === "GAME_ATTEMPT_ALREADY_SUBMITTED") {
        throw new ConflictError(
          "Game attempt is already completed",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ALREADY_COMPLETED
        );
      }
      if (error.message === "GAME_ATTEMPT_EXPIRED") {
        throw new ForbiddenError(
          "Game attempt has expired",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ATTEMPT_EXPIRED
        );
      }
      throw error;
    }
  }
}

module.exports = new GameAttemptService();
