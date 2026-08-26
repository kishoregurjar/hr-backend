const test = require("node:test");
const assert = require("node:assert");
const { AssessmentMapper } = require("../../src/modules/assessment/assessment.mapper");

test("Assessment Mapper & Payload Normalization Suite", async (t) => {
  await t.test("Normalizes title by trimming excess whitespaces", () => {
    const rawTitle = "  Senior   React   Developer   Assessment   ";
    const normalized = AssessmentMapper.normalizeTitle(rawTitle);
    assert.strictEqual(normalized, "Senior React Developer Assessment");
  });

  await t.test("Converts empty optional description strings to null", () => {
    const emptyDesc = "   ";
    const normalized = AssessmentMapper.normalizeOptionalString(emptyDesc);
    assert.strictEqual(normalized, null);
  });

  await t.test("Preserves valid non-empty description strings", () => {
    const validDesc = "  Valid assessment description  ";
    const normalized = AssessmentMapper.normalizeOptionalString(validDesc);
    assert.strictEqual(normalized, "Valid assessment description");
  });
});
