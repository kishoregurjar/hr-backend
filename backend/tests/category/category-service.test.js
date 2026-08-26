const test = require("node:test");
const assert = require("node:assert");
const { CategoryMapper } = require("../../src/modules/category/category.mapper");

test("Category Mapper Suite", async (t) => {
  await t.test("Normalizes category name for duplicate checking (lowercase and trimmed)", () => {
    const raw = "  Backend   Development  ";
    const normalized = CategoryMapper.normalizeName(raw);
    assert.strictEqual(normalized, "backend development");
  });

  await t.test("Creates persistence entity payload", () => {
    const rawData = {
      name: "  Frontend   Development  ",
      description: "  React and Next.js questions  ",
    };

    const entity = CategoryMapper.toCreateEntity(rawData, "usr_123");
    assert.strictEqual(entity.name, "Frontend Development");
    assert.strictEqual(entity.description, "React and Next.js questions");
    assert.strictEqual(entity.isActive, true);
  });
});
