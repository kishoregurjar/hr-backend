const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ATTEMPT_STATUS,
  isAttemptTransitionAllowed,
  isAttemptTerminalStatus,
  ATTEMPT_LIMITS,
} = require("../../src/modules/attempt/attempt.constants");

describe("Assessment Attempt Constants & Lifecycle State Machine Suite", () => {
  it("allows transition IN_PROGRESS -> SUBMITTED", () => {
    assert.equal(
      isAttemptTransitionAllowed(
        ATTEMPT_STATUS.IN_PROGRESS,
        ATTEMPT_STATUS.SUBMITTED
      ),
      true
    );
  });

  it("allows transition IN_PROGRESS -> EXPIRED", () => {
    assert.equal(
      isAttemptTransitionAllowed(
        ATTEMPT_STATUS.IN_PROGRESS,
        ATTEMPT_STATUS.EXPIRED
      ),
      true
    );
  });

  it("allows transition IN_PROGRESS -> CANCELLED", () => {
    assert.equal(
      isAttemptTransitionAllowed(
        ATTEMPT_STATUS.IN_PROGRESS,
        ATTEMPT_STATUS.CANCELLED
      ),
      true
    );
  });

  it("prevents transition SUBMITTED -> IN_PROGRESS (Terminal State)", () => {
    assert.equal(
      isAttemptTransitionAllowed(
        ATTEMPT_STATUS.SUBMITTED,
        ATTEMPT_STATUS.IN_PROGRESS
      ),
      false
    );
  });

  it("prevents transition EXPIRED -> SUBMITTED (Terminal State)", () => {
    assert.equal(
      isAttemptTransitionAllowed(
        ATTEMPT_STATUS.EXPIRED,
        ATTEMPT_STATUS.SUBMITTED
      ),
      false
    );
  });

  it("validates SUBMITTED as terminal status", () => {
    assert.equal(isAttemptTerminalStatus(ATTEMPT_STATUS.SUBMITTED), true);
  });

  it("validates EXPIRED as terminal status", () => {
    assert.equal(isAttemptTerminalStatus(ATTEMPT_STATUS.EXPIRED), true);
  });

  it("validates IN_PROGRESS as non-terminal status", () => {
    assert.equal(isAttemptTerminalStatus(ATTEMPT_STATUS.IN_PROGRESS), false);
  });

  it("verifies numerical attempt boundary constants", () => {
    assert.equal(ATTEMPT_LIMITS.MIN_ATTEMPT_NUMBER, 1);
    assert.equal(ATTEMPT_LIMITS.MAX_ATTEMPT_NUMBER, 10);
    assert.equal(ATTEMPT_LIMITS.MIN_PERCENTAGE, 0);
    assert.equal(ATTEMPT_LIMITS.MAX_PERCENTAGE, 100);
  });
});
