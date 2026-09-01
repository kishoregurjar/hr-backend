const test = require("node:test");
const assert = require("node:assert");
const {
  createTagSchema,
} = require("../../src/modules/tag/tag.validator");

test("Tag Validation Suite", async (t) => {
  await t.test("Valid tag creation payload passes validation", () => {
    const payload = {
      name: "React",
    };

    const parsed = createTagSchema.parse(payload);
    assert.strictEqual(parsed.name, "React");
  });

  await t.test("Rejects empty tag name", () => {
    const payload = {
      name: "  ",
    };

    assert.throws(() => {
      createTagSchema.parse(payload);
    });
  });
});
