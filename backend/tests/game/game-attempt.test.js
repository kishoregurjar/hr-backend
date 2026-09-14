"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateSubmitGame } = require("../../src/modules/game/game.attempt.validator");
const gameAttemptService = require("../../src/modules/game/game.attempt.service");
const gameSuperAdminService = require("../../src/modules/game/game.super-admin.service");

test("Candidate Game Attempt - Reject Client Supplied Score or Metrics in Validator", () => {
  assert.throws(
    () => {
      validateSubmitGame({
        solution: { path: ["0-0", "0-1"] },
        score: 100,
      });
    },
    (err) => {
      assert.match(err.message, /Client cannot provide score/i);
      return true;
    }
  );

  assert.throws(
    () => {
      validateSubmitGame({
        solution: { path: ["0-0", "0-1"] },
        metrics: { speed: 999 },
      });
    },
    (err) => {
      assert.match(err.message, /Client cannot provide score/i);
      return true;
    }
  );

  assert.throws(
    () => {
      validateSubmitGame({
        solution: { path: ["0-0", "0-1"] },
        passed: true,
      });
    },
    (err) => {
      assert.match(err.message, /Client cannot provide score/i);
      return true;
    }
  );
});

test("Candidate Game Attempt - Valid Solution Submission accepts only solution payload", () => {
  const parsed = validateSubmitGame({
    solution: { path: ["0-0", "0-1"] },
  });
  assert.deepEqual(parsed, { solution: { path: ["0-0", "0-1"] } });
});

test("Candidate Game Attempt - Start Attempt & Verify Puzzle Response Strips Solution", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_test_123";
  const slug = "zip";

  const result = await gameAttemptService.startGame({
    candidateId,
    candidateAssessmentId,
    slug,
  });

  assert.ok(result.attemptId);
  assert.ok(result.puzzle);
  assert.equal(result.puzzle.solution, undefined, "Solution key must be stripped from public puzzle payload");
  assert.equal(result.game.code, "ZIP_PATHFINDER");
});

test("Candidate Game Attempt - Block Start Attempt when Game is Disabled by Super Admin", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_test_123";
  const slug = "zip";

  // Super Admin disables ZIP_PATHFINDER
  await gameSuperAdminService.updateGameStatus("ZIP_PATHFINDER", false);

  await assert.rejects(
    async () => {
      await gameAttemptService.startGame({
        candidateId,
        candidateAssessmentId,
        slug,
      });
    },
    (err) => {
      assert.equal(err.code, "GAME_DISABLED");
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // Re-enable ZIP_PATHFINDER
  await gameSuperAdminService.updateGameStatus("ZIP_PATHFINDER", true);
});

test("Candidate Game Attempt - Submit Solution and Server-Authoritative Score Calculation", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_test_456";
  const slug = "zip";

  const started = await gameAttemptService.startGame({
    candidateId,
    candidateAssessmentId,
    slug,
  });

  const submissionResult = await gameAttemptService.submitGame({
    candidateId,
    candidateAssessmentId,
    attemptId: started.attemptId,
    solution: { path: ["0-0"] },
  });

  assert.ok(submissionResult);
  assert.equal(typeof submissionResult.score, "number");
  assert.ok(submissionResult.score >= 0 && submissionResult.score <= 100);
  assert.equal(submissionResult.status, "SUBMITTED");
});

test("Candidate Game Attempt - Double Submission Throws Conflict Error", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_test_789";
  const slug = "tango";

  const started = await gameAttemptService.startGame({
    candidateId,
    candidateAssessmentId,
    slug,
  });

  // First submission
  await gameAttemptService.submitGame({
    candidateId,
    candidateAssessmentId,
    attemptId: started.attemptId,
    solution: { grid: [] },
  });

  // Second submission attempt should fail
  await assert.rejects(
    async () => {
      await gameAttemptService.submitGame({
        candidateId,
        candidateAssessmentId,
        attemptId: started.attemptId,
        solution: { grid: [] },
      });
    },
    (err) => {
      assert.equal(err.code, "GAME_ALREADY_COMPLETED");
      return true;
    }
  );
});
