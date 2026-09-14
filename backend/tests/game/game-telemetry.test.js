"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateTelemetry } = require("../../src/modules/game/game.anticheat.service");
const { validateTelemetryBatch } = require("../../src/modules/game/game.telemetry.validator");
const telemetryService = require("../../src/modules/game/game.telemetry.service");

test("Game Telemetry - Validator rejects client cheatSeverity or score injection", () => {
  assert.throws(
    () => {
      validateTelemetryBatch({
        events: [
          {
            eventType: "GAME_FOCUS_LOST",
            cheatSeverity: "NONE",
          },
        ],
      });
    },
    (err) => {
      assert.match(err.message, /Invalid telemetry batch payload/i);
      return true;
    }
  );
});

test("Game Telemetry - Anti-Cheat Risk Signal Classification", () => {
  const events = [
    { eventType: "GAME_FOCUS_LOST" },
    { eventType: "GAME_FOCUS_LOST" },
    { eventType: "GAME_FOCUS_LOST" },
    { eventType: "VISIBILITY_HIDDEN" },
    { eventType: "VISIBILITY_HIDDEN" },
    { eventType: "VISIBILITY_HIDDEN" },
    { eventType: "FULLSCREEN_EXITED" },
    { eventType: "FULLSCREEN_EXITED" },
  ];

  const evalResult = evaluateTelemetry(events);
  assert.equal(evalResult.severity, "HIGH");
  assert.ok(evalResult.flags.includes("REPEATED_FOCUS_LOSS"));
  assert.ok(evalResult.flags.includes("REPEATED_VISIBILITY_CHANGE"));
  assert.ok(evalResult.flags.includes("REPEATED_FULLSCREEN_EXIT"));
});

test("Game Telemetry - Record Telemetry Batch & Return Sanitized Risk Summary", async () => {
  const candidateId = "cand_test_user_1";
  const candidateAssessmentId = "ca_test_telemetry";
  const attemptId = "att_test_123";

  const result = await telemetryService.recordTelemetry({
    candidateId,
    candidateAssessmentId,
    attemptId,
    events: [
      { eventType: "GAME_STARTED" },
      { eventType: "GAME_FOCUS_LOST" },
    ],
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
  });

  assert.equal(result.accepted, 2);
  assert.ok(result.cheat);
  assert.equal(result.cheat.severity, "NONE");
});
