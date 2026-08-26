const test = require("node:test");
const assert = require("node:assert");
const { TagMapper } = require("../../src/modules/tag/tag.mapper");

test("Tag Mapper Suite", async (t) => {
  await t.test("Normalizes tag name by trimming and lowercasing for duplicate check", () => {
    const raw = "  Node.js  ";
    const normalized = TagMapper.normalizeName(raw);
    assert.strictEqual(normalized, "node.js");
  });

  await t.test("Creates persistence entity payload", () => {
    const rawData = {
      name: "  React  ",
      description: "  React.js library tag  ",
    };

    const entity = TagMapper.toCreateEntity(rawData, "usr_123");
    assert.strictEqual(entity.name, "React");
    assert.strictEqual(entity.description, "React.js library tag");
    assert.strictEqual(entity.isActive, true);
  });
});
