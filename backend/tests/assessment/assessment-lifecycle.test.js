const test = require("node:test");
const assert = require("node:assert");
const {
  ASSESSMENT_STATUS,
  ASSESSMENT_TRANSITIONS,
  isAssessmentTransitionAllowed,
} = require("../../src/modules/assessment/assessment.constants");

test("Assessment Lifecycle State Machine Transition Suite", async (t) => {
  await t.test("DRAFT state allowed transitions include PUBLISHED", () => {
    const allowed = ASSESSMENT_TRANSITIONS[ASSESSMENT_STATUS.DRAFT];
    assert.strictEqual(allowed.includes(ASSESSMENT_STATUS.PUBLISHED), true);
  });

  await t.test("PUBLISHED state allowed transitions include ACTIVE and DRAFT", () => {
    const allowed = ASSESSMENT_TRANSITIONS[ASSESSMENT_STATUS.PUBLISHED];
    assert.strictEqual(allowed.includes(ASSESSMENT_STATUS.ACTIVE), true);
    assert.strictEqual(allowed.includes(ASSESSMENT_STATUS.DRAFT), true);
  });

  await t.test("ACTIVE state allowed transitions include ARCHIVED", () => {
    const allowed = ASSESSMENT_TRANSITIONS[ASSESSMENT_STATUS.ACTIVE];
    assert.strictEqual(allowed.includes(ASSESSMENT_STATUS.ARCHIVED), true);
  });

  await t.test("ARCHIVED is a terminal state with zero outbound transitions", () => {
    const allowed = ASSESSMENT_TRANSITIONS[ASSESSMENT_STATUS.ARCHIVED];
    assert.strictEqual(allowed.length, 0);
  });

  await t.test("isAssessmentTransitionAllowed helper function validates transitions", () => {
    assert.strictEqual(
      isAssessmentTransitionAllowed(
        ASSESSMENT_STATUS.DRAFT,
        ASSESSMENT_STATUS.PUBLISHED
      ),
      true
    );
    assert.strictEqual(
      isAssessmentTransitionAllowed(
        ASSESSMENT_STATUS.DRAFT,
        ASSESSMENT_STATUS.ARCHIVED
      ),
      false
    );
  });
});
