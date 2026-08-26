const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptRepository = require("../../src/modules/attempt/attempt.repository");

describe("Assessment Attempt Repository Methods Contract Suite", () => {
  it("exposes essential lookup repository methods", () => {
    assert.equal(typeof attemptRepository.findById, "function");
    assert.equal(typeof attemptRepository.findByAttemptNumber, "function");
    assert.equal(typeof attemptRepository.findActiveAttempt, "function");
    assert.equal(typeof attemptRepository.findCurrentAttempt, "function");
    assert.equal(typeof attemptRepository.findActiveAttemptForCandidate, "function");
    assert.equal(typeof attemptRepository.findLatestAttempt, "function");
    assert.equal(typeof attemptRepository.countAttempts, "function");
  });

  it("exposes attempt creation & snapshot methods", () => {
    assert.equal(typeof attemptRepository.createAttempt, "function");
    assert.equal(typeof attemptRepository.createAttemptQuestions, "function");
    assert.equal(typeof attemptRepository.findAttemptQuestion, "function");
    assert.equal(typeof attemptRepository.findAttemptQuestionForAnswer, "function");
    assert.equal(typeof attemptRepository.findAttemptQuestions, "function");
  });

  it("exposes answer upsert & idempotency methods", () => {
    assert.equal(typeof attemptRepository.findAnswer, "function");
    assert.equal(typeof attemptRepository.findAttemptAnswer, "function");
    assert.equal(typeof attemptRepository.upsertAnswer, "function");
    assert.equal(typeof attemptRepository.upsertAttemptAnswer, "function");
  });

  it("exposes state transition & submission methods", () => {
    assert.equal(typeof attemptRepository.updateAttempt, "function");
    assert.equal(typeof attemptRepository.updateStatus, "function");
    assert.equal(typeof attemptRepository.submitAttempt, "function");
    assert.equal(typeof attemptRepository.expireAttempt, "function");
    assert.equal(typeof attemptRepository.lockAttemptForSubmission, "function");
    assert.equal(typeof attemptRepository.findAttemptForEvaluation, "function");
  });

  it("exposes candidate list & count methods", () => {
    assert.equal(typeof attemptRepository.listByCandidate, "function");
    assert.equal(typeof attemptRepository.countByCandidate, "function");
    assert.equal(typeof attemptRepository.transaction, "function");
  });

  it("exposes candidate invitation repository methods", () => {
    assert.equal(typeof attemptRepository.findInvitationByTokenHash, "function");
    assert.equal(typeof attemptRepository.findInvitationById, "function");
    assert.equal(typeof attemptRepository.createInvitation, "function");
    assert.equal(typeof attemptRepository.updateInvitationStatus, "function");
    assert.equal(typeof attemptRepository.markInvitationOpened, "function");
    assert.equal(typeof attemptRepository.markInvitationOpenedIfUsable, "function");
    assert.equal(typeof attemptRepository.markInvitationCompleted, "function");
    assert.equal(typeof attemptRepository.markInvitationExpired, "function");
    assert.equal(typeof attemptRepository.findActiveInvitation, "function");
    assert.equal(typeof attemptRepository.findCandidatesByIds, "function");
  });
});
