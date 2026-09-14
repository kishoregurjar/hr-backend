"use strict";

const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  UnauthorizedError,
} = require("../../common/errors");
const repository = require("./game.attempt.repository");
const { getGameDefinition, getGameMetadataBySlug } = require("./game.registry");
const { createGameSeed } = require("./game.engine.crypto");
const { validateGeneratedPuzzle } = require("./game.engine.validator");
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

function sanitizeGameMetrics(metrics) {
  if (metrics === null || metrics === undefined) {
    return null;
  }

  if (typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new BadRequestError(
      "Invalid game metrics",
      GAME_ATTEMPT_CONSTANTS.ERROR_CODES.INVALID_GAME_SCORE
    );
  }

  const serialized = JSON.stringify(metrics);

  if (Buffer.byteLength(serialized, "utf8") > 20_000) {
    throw new BadRequestError(
      "Game metrics are too large",
      GAME_ATTEMPT_CONSTANTS.ERROR_CODES.INVALID_GAME_SCORE
    );
  }

  return metrics;
}

function calculateServerAuthoritativeScore(verification, elapsedMs) {
  const isValid = typeof verification?.valid === "boolean" ? verification.valid : (verification?.correct ?? false);
  if (!isValid) {
    return 0;
  }

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

    // 1. Resolve game via registry
    const gameDefinition = getGameDefinition(slug);
    const metadata = getGameMetadataBySlug(slug);

    if (!gameDefinition && !metadata) {
      throw new NotFoundError(
        "Game not found",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_NOT_FOUND
      );
    }

    const canonicalCode = gameDefinition ? gameDefinition.code : (metadata.code || metadata.id);

    // 2. Verify candidate assessment access
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

    // 3. Verify Game exists & is active platform-wide (DB lookup by canonical code)
    const game = await gameSuperAdminService.getGame(canonicalCode);
    if (!game || game.isActive === false) {
      throw new ForbiddenError(
        "This game is currently disabled.",
        GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_DISABLED
      );
    }

    // 4. Verify game attached to assessment
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

    // 5. Verify game not already completed
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

    // 6. Reuse active attempt if present
    let attempt = await repository.findActiveAttempt(
      candidateAssessmentId,
      game.id
    );

    if (!attempt || now > attempt.expiresAt) {
      const seed = createGameSeed();
      let puzzleState;
      let puzzleVersion = gameDefinition ? gameDefinition.version : 1;

      if (gameDefinition && gameDefinition.engine) {
        const generatedPuzzle = await gameDefinition.engine.generatePuzzle({
          seed,
          version: gameDefinition.version,
        });

        validateGeneratedPuzzle(generatedPuzzle);

        if (generatedPuzzle.version !== gameDefinition.version) {
          throw new ConflictError(
            "Game engine version mismatch",
            GAME_ATTEMPT_CONSTANTS.ERROR_CODES.GAME_ENGINE_NOT_FOUND
          );
        }

        puzzleState = {
          puzzle: generatedPuzzle.puzzle,
          solution: generatedPuzzle.solution,
          seed: generatedPuzzle.seed,
        };
        puzzleVersion = generatedPuzzle.version;
      } else {
        puzzleState = await gameService.generatePuzzle(metadata.slug);
      }

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
        puzzleVersion,
        expiresAt,
      });
    }

    const publicPuzzle = attempt.puzzleState?.puzzle || stripSolutionFromPuzzle(attempt.puzzleState);
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

    // Determine game metadata & code via registry
    const game = attempt.game || (await gameSuperAdminService.getGame(attempt.gameId));
    const gameCode = game.code || game.id || attempt.gameId;
    const gameDefinition = getGameDefinition(gameCode) || getGameDefinition(game.slug || "");
    const metadata = getGameMetadataBySlug(gameCode);

    let verification;
    let score;
    let engineMetrics = {};

    if (gameDefinition && gameDefinition.engine) {
      const engine = gameDefinition.engine;
      verification = await engine.verifySolution({
        puzzle: attempt.puzzleState?.puzzle || attempt.puzzleState,
        solution: attempt.puzzleState?.solution,
        candidateSolution: solution,
      });

      const scoreResult = await engine.calculateScore({
        verification,
        startedAt: attempt.startedAt,
        submittedAt: now,
      });

      if (typeof scoreResult === "object" && scoreResult !== null) {
        score = scoreResult.score;
        engineMetrics = scoreResult.metrics || {};
      } else {
        score = Number(scoreResult) || 0;
      }

      if (
        !Number.isInteger(score) ||
        score < GAME_ATTEMPT_CONSTANTS.SCORE.MIN ||
        score > GAME_ATTEMPT_CONSTANTS.SCORE.MAX
      ) {
        throw new BadRequestError(
          "Invalid game score",
          GAME_ATTEMPT_CONSTANTS.ERROR_CODES.INVALID_GAME_SCORE
        );
      }
    } else {
      verification = await gameService.verifySolution(
        metadata ? metadata.slug : gameCode,
        solution,
        attempt.puzzleState
      );
      const elapsedMs = Math.max(0, now.getTime() - attempt.startedAt.getTime());
      score = calculateServerAuthoritativeScore(verification, elapsedMs);
    }

    const elapsedMs = Math.max(0, now.getTime() - attempt.startedAt.getTime());
    const isValidSolution = typeof verification?.valid === "boolean" ? verification.valid : (verification?.correct ?? false);

    const rawMetrics = {
      elapsedMs,
      verifiedAt: now.toISOString(),
      valid: isValidSolution,
      reason: verification?.reason || null,
      error: verification?.error || null,
      ...engineMetrics,
    };

    const metrics = sanitizeGameMetrics(rawMetrics);

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
