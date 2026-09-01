const test = require("node:test");
const assert = require("node:assert");
const { QuestionMapper } = require("../../src/modules/question/question.mapper");

test("Question Mapper Suite", async (t) => {
  await t.test("Normalizes question title by lowercasing and trimming excess whitespaces", () => {
    const raw = "  What   is   Event   Loop   in   Node.js?  ";
    const normalized = QuestionMapper.normalizeTitle(raw);
    assert.strictEqual(normalized, "what is event loop in node.js?");
  });

  await t.test("Formats options array cleanly into entities with sequence", () => {
    const rawOptions = [
      { optionText: "First Option", isCorrect: true },
      { optionText: "Second Option", isCorrect: false },
    ];

    const entities = QuestionMapper.toOptionEntities(rawOptions);
    assert.strictEqual(entities.length, 2);
    assert.strictEqual(entities[0].sequence, 1);
    assert.strictEqual(entities[1].sequence, 2);
  });
});
