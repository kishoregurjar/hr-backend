const test = require("node:test");
const assert = require("node:assert");
const {
  createCategorySchema,
} = require("../../src/modules/category/category.validator");

test("Category Validation Suite", async (t) => {
  await t.test("Valid category creation payload passes validation", () => {
    const payload = {
      name: "Frontend Development",
      description: "React, Next.js, and CSS questions",
    };

    const parsed = createCategorySchema.parse(payload);
    assert.strictEqual(parsed.name, "Frontend Development");
  });

  await t.test("Rejects empty category name", () => {
    const payload = {
      name: "   ",
    };

    assert.throws(() => {
      createCategorySchema.parse(payload);
    });
  });
});
