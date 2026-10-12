const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const { ATTEMPT_ERRORS } = require("../../src/modules/attempt/attempt.constants");
const { NotFoundError, ConflictError, BadRequestError, UnauthorizedError } = require("../../src/common/errors");

describe("Assessment Attempt Service Workflow & Validation Suite", () => {
  it("validates active assessment availability successfully", () => {
    const assessment = {
      id: "assessment-1",
      status: "ACTIVE",
      startsAt: new Date("2026-08-20T00:00:00.000Z"),
      endsAt: new Date("2026-08-30T00:00:00.000Z"),
    };

    assert.doesNotThrow(() => {
      attemptService.validateAssessmentAvailability(assessment, new Date("2026-08-21T10:00:00.000Z"));
    });
  });

  it("throws error if assessment is missing or draft", () => {
    assert.throws(
      () => attemptService.validateAssessmentAvailability(null),
      (err) => err instanceof NotFoundError || err.errorCode === ATTEMPT_ERRORS.ASSESSMENT_NOT_FOUND
    );

    const draftAssessment = { id: "a1", status: "DRAFT" };
    assert.throws(
      () => attemptService.validateAssessmentAvailability(draftAssessment),
      (err) => err instanceof ConflictError || err.errorCode === ATTEMPT_ERRORS.ASSESSMENT_NOT_ACTIVE
    );
  });

  it("calculates effective expiresAt based on durationMinutes", () => {
    const startedAt = new Date("2026-08-21T10:00:00.000Z");
    const expiresAt = attemptService.calculateExpiresAt({
      startedAt,
      durationMinutes: 60,
      endsAt: null,
    });

    assert.equal(expiresAt.getTime(), new Date("2026-08-21T11:00:00.000Z").getTime());
  });

  it("caps expiresAt to assessment.endsAt if endsAt is earlier than durationExpiry", () => {
    const startedAt = new Date("2026-08-21T10:00:00.000Z");
    const endsAt = new Date("2026-08-21T10:30:00.000Z");
    const expiresAt = attemptService.calculateExpiresAt({
      startedAt,
      durationMinutes: 60,
      endsAt,
    });

    assert.equal(expiresAt.getTime(), endsAt.getTime());
  });

  it("validates assigned questions presence in assessment", () => {
    const assessmentWithQuestions = {
      questions: [{ id: "aq1", questionId: "q1", sequence: 1, marks: 5, negativeMarks: 0 }],
    };

    const questions = attemptService.getAssessmentQuestions(assessmentWithQuestions);
    assert.equal(questions.length, 1);

    assert.throws(
      () => attemptService.getAssessmentQuestions({ questions: [] }),
      (err) => err instanceof ConflictError || err.errorCode === ATTEMPT_ERRORS.INVALID_REQUEST
    );
  });

  it("calculates default invitation expiry when requestedExpiresAt is omitted", () => {
    const now = Date.now();
    const expiry = attemptService.calculateInvitationExpiry();
    const diffHours = (expiry.getTime() - now) / (1000 * 60 * 60);

    assert.equal(Math.round(diffHours), 72);
  });

  it("accepts valid requestedExpiresAt within maximum boundary", () => {
    const validExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = attemptService.calculateInvitationExpiry(validExpiry);

    assert.equal(result.getTime(), validExpiry.getTime());
  });

  it("rejects invitation expiry that exceeds maximum 168 hours boundary", () => {
    const excessiveExpiry = new Date(Date.now() + 200 * 60 * 60 * 1000);

    assert.throws(
      () => attemptService.calculateInvitationExpiry(excessiveExpiry),
      (err) => err instanceof BadRequestError
    );
  });

  it("rejects createInvitation if assessmentId, candidateId, or invitedByUserId is missing", async () => {
    await assert.rejects(
      () => attemptService.createInvitation({ candidateId: "c1", invitedByUserId: "hr1" }),
      (err) => err instanceof BadRequestError
    );

    await assert.rejects(
      () => attemptService.createInvitation({ assessmentId: "a1", invitedByUserId: "hr1" }),
      (err) => err instanceof BadRequestError
    );

    await assert.rejects(
      () => attemptService.createInvitation({ assessmentId: "a1", candidateId: "c1" }),
      (err) => err instanceof UnauthorizedError
    );
  });

  it("rejects findInvitationByRawToken if rawToken is missing or empty", async () => {
    await assert.rejects(
      () => attemptService.findInvitationByRawToken(""),
      (err) => err instanceof BadRequestError
    );
    await assert.rejects(
      () => attemptService.findInvitationByRawToken(null),
      (err) => err instanceof BadRequestError
    );
  });

  it("rejects createBulkInvitations if candidateIds is empty or duplicate or >500", async () => {
    await assert.rejects(
      () => attemptService.createBulkInvitations({ assessmentId: "a1", candidateIds: [], invitedByUserId: "hr1" }),
      (err) => err instanceof BadRequestError
    );

    await assert.rejects(
      () => attemptService.createBulkInvitations({ assessmentId: "a1", candidateIds: ["c1", "c1"], invitedByUserId: "hr1" }),
      (err) => err instanceof BadRequestError
    );

    const over500 = Array.from({ length: 501 }, (_, i) => `c-${i}`);
    await assert.rejects(
      () => attemptService.createBulkInvitations({ assessmentId: "a1", candidateIds: over500, invitedByUserId: "hr1" }),
      (err) => err instanceof BadRequestError
    );
  });

  it("rejects startAttemptByToken if token is missing or empty", async () => {
    await assert.rejects(
      () => attemptService.startAttemptByToken({ token: "" }),
      (err) => err instanceof BadRequestError
    );
    await assert.rejects(
      () => attemptService.startAttemptByToken({ token: null }),
      (err) => err instanceof BadRequestError
    );
  });

  it("rejects getCurrentAttemptByToken if token is missing or empty", async () => {
    await assert.rejects(
      () => attemptService.getCurrentAttemptByToken({ token: "" }),
      (err) => err instanceof BadRequestError
    );
    await assert.rejects(
      () => attemptService.getCurrentAttemptByToken({ token: null }),
      (err) => err instanceof BadRequestError
    );
  });

  it("validates selected options against question type & options", () => {
    const singleChoiceQuestion = {
      type: "SINGLE_CHOICE",
      options: [{ id: "opt-1" }, { id: "opt-2" }],
    };

    assert.deepEqual(
      attemptService.validateSelectedOptions(["opt-1"], singleChoiceQuestion),
      ["opt-1"]
    );

    assert.throws(
      () => attemptService.validateSelectedOptions(["opt-99"], singleChoiceQuestion),
      (err) => err instanceof BadRequestError
    );

    assert.throws(
      () => attemptService.validateSelectedOptions(["opt-1", "opt-2"], singleChoiceQuestion),
      (err) => err instanceof BadRequestError
    );
  });

  it("validates answer text for subjective and objective questions", () => {
    const subjectiveQuestion = { type: "SHORT_ANSWER" };
    const mcqQuestion = { type: "SINGLE_CHOICE" };

    assert.equal(
      attemptService.validateAnswerText("My answer", subjectiveQuestion),
      "My answer"
    );

    assert.throws(
      () => attemptService.validateAnswerText("", subjectiveQuestion),
      (err) => err instanceof BadRequestError
    );

    assert.throws(
      () => attemptService.validateAnswerText("Text answer", mcqQuestion),
      (err) => err instanceof BadRequestError
    );
  });

  it("rejects saveAnswerByToken if token or questionId is missing", async () => {
    await assert.rejects(
      () => attemptService.saveAnswerByToken({ token: "", questionId: "q1" }),
      (err) => err instanceof BadRequestError
    );

    await assert.rejects(
      () => attemptService.saveAnswerByToken({ token: "inv_123", questionId: "" }),
      (err) => err instanceof BadRequestError
    );
  });

  describe("calculateAttemptNumber", () => {
    const origFindLatestAttempt = attemptRepository.findLatestAttempt;
    const origCountAttempts = attemptRepository.countAttempts;

    it("returns attempt number 1 when no previous attempts exist", async () => {
      attemptRepository.findLatestAttempt = async () => null;

      const result = await attemptService.calculateAttemptNumber({
        assessmentId: "ass-1",
        candidateId: "cand-1",
      });

      assert.equal(result, 1);
    });

    it("returns attempt number 2 when 1 previous attempt exists without attemptNumber", async () => {
      attemptRepository.findLatestAttempt = async () => ({
        id: "att-prev-1",
        status: "SUBMITTED",
        // attemptNumber is undefined, matching production CandidateAttempt schema
      });
      attemptRepository.countAttempts = async () => 1;

      const result = await attemptService.calculateAttemptNumber({
        assessmentId: "ass-1",
        candidateId: "cand-1",
      });

      assert.equal(result, 2);
    });

    it("returns N + 1 when N previous attempts exist without attemptNumber", async () => {
      attemptRepository.findLatestAttempt = async () => ({
        id: "att-prev-5",
        status: "SUBMITTED",
      });
      attemptRepository.countAttempts = async () => 5;

      const result = await attemptService.calculateAttemptNumber({
        assessmentId: "ass-1",
        candidateId: "cand-1",
      });

      assert.equal(result, 6);
    });

    it("supports valid mocked integer attemptNumber when present", async () => {
      attemptRepository.findLatestAttempt = async () => ({
        id: "att-mock-2",
        attemptNumber: 2,
      });
      attemptRepository.countAttempts = async () => {
        throw new Error("countAttempts should not be called when attemptNumber is valid");
      };

      const result = await attemptService.calculateAttemptNumber({
        assessmentId: "ass-1",
        candidateId: "cand-1",
      });

      assert.equal(result, 3);
    });

    it("propagates findLatestAttempt repository errors", async () => {
      attemptRepository.findLatestAttempt = async () => {
        throw new Error("DB findLatestAttempt failure");
      };

      await assert.rejects(
        () =>
          attemptService.calculateAttemptNumber({
            assessmentId: "ass-1",
            candidateId: "cand-1",
          }),
        { message: "DB findLatestAttempt failure" }
      );
    });

    it("propagates countAttempts repository errors", async () => {
      attemptRepository.findLatestAttempt = async () => ({
        id: "att-prev-1",
      });
      attemptRepository.countAttempts = async () => {
        throw new Error("DB countAttempts failure");
      };

      await assert.rejects(
        () =>
          attemptService.calculateAttemptNumber({
            assessmentId: "ass-1",
            candidateId: "cand-1",
          }),
        { message: "DB countAttempts failure" }
      );
    });

    it("preserves transaction client tx argument", async () => {
      const mockTx = { isMockTx: true };
      let txPassedToFind = null;
      let txPassedToCount = null;

      attemptRepository.findLatestAttempt = async (_filter, tx) => {
        txPassedToFind = tx;
        return { id: "att-prev-1" };
      };
      attemptRepository.countAttempts = async (_filter, tx) => {
        txPassedToCount = tx;
        return 1;
      };

      const result = await attemptService.calculateAttemptNumber(
        { assessmentId: "ass-1", candidateId: "cand-1" },
        mockTx
      );

      assert.equal(result, 2);
      assert.equal(txPassedToFind, mockTx);
      assert.equal(txPassedToCount, mockTx);

      // Restore original repository functions
      attemptRepository.findLatestAttempt = origFindLatestAttempt;
      attemptRepository.countAttempts = origCountAttempts;
    });
  });
});

