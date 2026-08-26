const test = require("node:test");
const assert = require("node:assert");
const {
  createQuestionSchema,
} = require("../../src/modules/question/question.validator");

test("Question Validation Suite", async (t) => {
  await t.test("Valid MCQ Question creation payload passes validation", () => {
    const payload = {
      body: {
        title: "What is the primary role of React useEffect hook?",
        description: "Core React Lifecycle Question",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        status: "PUBLISHED",
        categoryId: "cm_cat_frontend_123",
        tagIds: ["cm_tag_react_123"],
        marks: 5,
        negativeMarks: 0,
        options: [
          {
            optionText: "To perform side effects in functional components",
            isCorrect: true,
            sequence: 1,
          },
          {
            optionText: "To render direct DOM elements directly",
            isCorrect: false,
            sequence: 2,
          },
        ],
      },
    };

    const parsed = createQuestionSchema.parse(payload);
    assert.strictEqual(parsed.body.title, "What is the primary role of React useEffect hook?");
    assert.strictEqual(parsed.body.type, "SINGLE_CHOICE");
    assert.strictEqual(parsed.body.options.length, 2);
  });

  await t.test("Rejects Question payload with no correct option", () => {
    const payload = {
      body: {
        title: "Question without any correct answer option",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        status: "DRAFT",
        categoryId: "cm_cat_123",
        options: [
          { optionText: "Option A", isCorrect: false, sequence: 1 },
          { optionText: "Option B", isCorrect: false, sequence: 2 },
        ],
      },
    };

    assert.throws(() => {
      createQuestionSchema.parse(payload);
    });
  });

  await t.test("Rejects invalid question type enum (e.g. MCQ)", () => {
    const payload = {
      body: {
        title: "Invalid Question Type Test",
        type: "MCQ", // Invalid Enum! Should be SINGLE_CHOICE
        difficulty: "EASY",
        categoryId: "cm_cat_123",
      },
    };

    assert.throws(() => {
      createQuestionSchema.parse(payload);
    });
  });
});
