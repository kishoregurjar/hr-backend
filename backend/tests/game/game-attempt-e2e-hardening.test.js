"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const gameAttemptService = require("../../src/modules/game/game.attempt.service");
const gameSuperAdminService = require("../../src/modules/game/game.super-admin.service");
const { getGameDefinition } = require("../../src/modules/game/game.registry");
const { validateSubmitGame } = require("../../src/modules/game/game.attempt.validator");
const repository = require("../../src/modules/game/game.attempt.repository");

test.describe("GameAttempt End-to-End Hardening & Integration", () => {
  test("1. ZIP, Tango, Mini Sudoku, and Mahjong registry integration resolution", () => {
    const games = ["zip-pathfinder", "tango", "mini-sudoku", "mahjong-tile-match"];
    for (const slug of games) {
      const def = getGameDefinition(slug);
      assert.ok(def, `Registry must resolve definition for ${slug}`);
      assert.ok(def.code, `Definition for ${slug} must have canonical code`);
      assert.ok(def.engine, `Definition for ${slug} must have engine`);
    }
  });

  test("2. Start Game Integration - Generates server puzzle and strips solution & seed", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_100";

    const attemptResponse = await gameAttemptService.startGame({
      candidateId,
      candidateAssessmentId,
      slug: "mini-sudoku",
    });

    assert.ok(attemptResponse.attemptId);
    assert.equal(attemptResponse.game.code, "MINI_SUDOKU");
    assert.ok(attemptResponse.puzzle);
    assert.equal(attemptResponse.puzzle.solution, undefined, "Solution must be stripped");
    assert.equal(attemptResponse.puzzle.seed, undefined, "Seed must be stripped");
  });

  test("3. Submit Game Integration - Produces server-calculated score and sanitized metrics", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_200";

    const attempt = await gameAttemptService.startGame({
      candidateId,
      candidateAssessmentId,
      slug: "mini-sudoku",
    });

    // Fetch attempt details from repository to get server solution for testing
    const attemptRecord = await repository.findAttemptForCandidate(attempt.attemptId, candidateAssessmentId);
    const serverSolution = attemptRecord.puzzleState.solution;

    const result = await gameAttemptService.submitGame({
      candidateId,
      candidateAssessmentId,
      attemptId: attempt.attemptId,
      solution: serverSolution,
    });

    assert.ok(result.id);
    assert.equal(result.score, 100);
    assert.equal(result.status, "SUBMITTED");
    assert.equal(result.metrics.completed, true);
  });

  test("4. Expired Attempt Verification - Rejects expired attempts", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_300";

    const attempt = await gameAttemptService.startGame({
      candidateId,
      candidateAssessmentId,
      slug: "mahjong-tile-match",
    });

    // Manually expire the attempt in repository memory/store
    const attemptRecord = await repository.findAttemptForCandidate(attempt.attemptId, candidateAssessmentId);
    attemptRecord.expiresAt = new Date(Date.now() - 60000); // 1 minute in the past

    await assert.rejects(
      async () => {
        await gameAttemptService.submitGame({
          candidateId,
          candidateAssessmentId,
          attemptId: attempt.attemptId,
          solution: { moves: [] },
        });
      },
      (err) => {
        assert.equal(err.code, "GAME_ATTEMPT_EXPIRED");
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  test("5. Duplicate Submission Prevention - Throws GAME_ALREADY_COMPLETED", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_400";

    const attempt = await gameAttemptService.startGame({
      candidateId,
      candidateAssessmentId,
      slug: "tango",
    });

    await gameAttemptService.submitGame({
      candidateId,
      candidateAssessmentId,
      attemptId: attempt.attemptId,
      solution: { grid: {} },
    });

    await assert.rejects(
      async () => {
        await gameAttemptService.submitGame({
          candidateId,
          candidateAssessmentId,
          attemptId: attempt.attemptId,
          solution: { grid: {} },
        });
      },
      (err) => {
        assert.equal(err.code, "GAME_ALREADY_COMPLETED");
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  test("6. Candidate Ownership Boundary - Prevents unauthorized candidate access", async () => {
    const candidateA = "cand_owner_A";
    const candidateB = "cand_imposter_B";
    const caA = "ca_owner_A_100";

    const attemptA = await gameAttemptService.startGame({
      candidateId: candidateA,
      candidateAssessmentId: caA,
      slug: "mini-sudoku",
    });

    // Candidate B attempting to submit candidate A's attempt
    await assert.rejects(
      async () => {
        await gameAttemptService.submitGame({
          candidateId: candidateB,
          candidateAssessmentId: caA,
          attemptId: attemptA.attemptId,
          solution: { board: [] },
        });
      },
      (err) => {
        assert.equal(err.code, "CANDIDATE_ASSESSMENT_NOT_FOUND");
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  test("7. Disabled Game Boundary - Rejects start attempt for disabled games", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_500";

    // Disable TANGO
    await gameSuperAdminService.updateGameStatus("TANGO", false);

    await assert.rejects(
      async () => {
        await gameAttemptService.startGame({
          candidateId,
          candidateAssessmentId,
          slug: "tango",
        });
      },
      (err) => {
        assert.equal(err.code, "GAME_DISABLED");
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Re-enable TANGO
    await gameSuperAdminService.updateGameStatus("TANGO", true);
  });

  test("8. Score Tampering Protection - Rejects client-side score/passed injection in validator", () => {
    assert.throws(
      () => validateSubmitGame({ solution: [], score: 100 }),
      /Client cannot provide score/i
    );

    assert.throws(
      () => validateSubmitGame({ solution: [], metrics: { cheat: 1 } }),
      /Client cannot provide score/i
    );

    assert.throws(
      () => validateSubmitGame({ solution: [], passed: true }),
      /Client cannot provide score/i
    );
  });

  test("9. GameResult Idempotency & Persistence - Idempotent query verification", async () => {
    const candidateId = "cand_e2e_user_1";
    const candidateAssessmentId = "ca_e2e_600";

    const attempt = await gameAttemptService.startGame({
      candidateId,
      candidateAssessmentId,
      slug: "zip-pathfinder",
    });

    const submitted = await gameAttemptService.submitGame({
      candidateId,
      candidateAssessmentId,
      attemptId: attempt.attemptId,
      solution: { path: [] },
    });

    const existing = await repository.findGameResult(candidateAssessmentId, attempt.game.id);
    assert.ok(existing);
    assert.equal(existing.score, submitted.score);
  });
});
