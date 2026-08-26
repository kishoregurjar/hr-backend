const crypto = require("node:crypto");
const { ATTEMPT_STATUS, INVITATION_TOKEN_PREFIX } = require("./attempt.constants");

/**
 * ==========================================================
 * Assessment Attempt Mapper
 * ==========================================================
 * Responsibilities:
 * 1. Convert validated application data into persistence data.
 * 2. Create AttemptQuestion snapshot payloads from AssessmentQuestion records.
 * 3. Normalize answer payloads before persistence.
 * 4. Generate & hash cryptographically secure invitation tokens.
 * 5. Map Candidate Invitation entities for persistence.
 * Placed directly at src/modules/attempt/attempt.mapper.js
 * matching 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */

/**
 * Utility: Normalize String
 */
const normalizeString = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

/**
 * Utility: Normalize Option IDs
 */
const normalizeSelectedOptionIds = (optionIds) => {
  if (!Array.isArray(optionIds)) {
    return [];
  }

  return [
    ...new Set(
      optionIds
        .filter((id) => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
};

/**
 * ------------------------------------------------------------
 * Normalize Answer Text
 * ------------------------------------------------------------
 */
const normalizeAnswerText = (answerText) => {
  if (typeof answerText !== "string") {
    return null;
  }

  const normalized = answerText.trim();

  return normalized.length > 0 ? normalized : null;
};

/**
 * ------------------------------------------------------------
 * Map Answer To Persistence Entity
 * ------------------------------------------------------------
 */
const toAttemptAnswerEntity = ({
  attemptId,
  questionId,
  selectedOptionIds,
  answerText,
}) => {
  return {
    attemptId,
    questionId,
    selectedOptionIds: normalizeSelectedOptionIds(selectedOptionIds),
    answerText: normalizeAnswerText(answerText),
  };
};

/**
 * Map Create Attempt Entity
 */
const toCreateEntity = ({
  assessmentId,
  candidateId,
  attemptNumber,
  startedAt,
  expiresAt,
}) => {
  if (!assessmentId) {
    throw new TypeError("assessmentId is required.");
  }
  if (!candidateId) {
    throw new TypeError("candidateId is required.");
  }
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new TypeError("attemptNumber must be a positive integer.");
  }
  if (!(startedAt instanceof Date)) {
    throw new TypeError("startedAt must be a valid Date.");
  }
  if (!(expiresAt instanceof Date)) {
    throw new TypeError("expiresAt must be a valid Date.");
  }
  if (expiresAt <= startedAt) {
    throw new TypeError("expiresAt must be later than startedAt.");
  }

  return {
    assessmentId,
    candidateId,
    attemptNumber,
    status: ATTEMPT_STATUS.IN_PROGRESS,
    startedAt,
    expiresAt,
    submittedAt: null,
    cancelledAt: null,
    score: null,
    percentage: null,
    passed: null,
  };
};

/**
 * Map AssessmentQuestion -> AttemptQuestion Snapshot Entity
 */
const toAttemptQuestionEntity = (assessmentQuestion, attemptId, index = 0) => {
  if (!assessmentQuestion) {
    throw new TypeError("assessmentQuestion is required.");
  }
  if (!attemptId) {
    throw new TypeError("attemptId is required.");
  }
  if (!assessmentQuestion.questionId) {
    throw new TypeError("assessmentQuestion.questionId is required.");
  }

  const sequence =
    Number.isInteger(assessmentQuestion.sequence) && assessmentQuestion.sequence >= 1
      ? assessmentQuestion.sequence
      : Number.isInteger(assessmentQuestion.orderIndex) && assessmentQuestion.orderIndex >= 1
      ? assessmentQuestion.orderIndex
      : index + 1;

  const questionObj = assessmentQuestion.question || assessmentQuestion;
  const questionSnapshot = {
    id: questionObj.id || assessmentQuestion.questionId,
    title: questionObj.title || "",
    content: questionObj.content || "",
    type: questionObj.type || "SINGLE_CHOICE",
    options: Array.isArray(questionObj.options)
      ? questionObj.options.map((o) => ({ id: o.id, optionText: o.optionText, sequence: o.sequence }))
      : [],
  };

  const res = {
    attemptId,
    questionId: assessmentQuestion.questionId,
    sequence,
  };

  if (assessmentQuestion.marks !== undefined) {
    res.marks = assessmentQuestion.marks;
  }
  if (assessmentQuestion.negativeMarks !== undefined) {
    res.negativeMarks = assessmentQuestion.negativeMarks;
  }

  if (assessmentQuestion.question || assessmentQuestion.questionSnapshot || (assessmentQuestion.marks === undefined && assessmentQuestion.negativeMarks === undefined)) {
    res.questionSnapshot = questionSnapshot;
  }

  return res;
};

/**
 * Map Multiple Assessment Questions to Attempt Question Snapshots
 */
const toAttemptQuestionEntities = (assessmentQuestions, attemptId) => {
  if (!Array.isArray(assessmentQuestions)) {
    throw new TypeError("assessmentQuestions must be an array.");
  }
  if (assessmentQuestions.length === 0) {
    return [];
  }
  return assessmentQuestions.map((q, idx) => toAttemptQuestionEntity(q, attemptId, idx));
};

/**
 * Map Save Answer Entity
 */
const toAnswerEntity = ({ attemptId, questionId, selectedOptionIds, answerText }) => {
  if (!attemptId) {
    throw new TypeError("attemptId is required.");
  }
  if (!questionId) {
    throw new TypeError("questionId is required.");
  }

  const normalizedOptions = normalizeSelectedOptionIds(selectedOptionIds);
  const normalizedText = normalizeString(answerText);

  return {
    attemptId,
    questionId,
    selectedOptionIds: normalizedOptions,
    answerText: normalizedText ?? null,
  };
};

/**
 * Map Update Answer Entity
 */
const toAnswerUpdateEntity = ({ selectedOptionIds, answerText }) => {
  const data = {};
  if (selectedOptionIds !== undefined) {
    data.selectedOptionIds = normalizeSelectedOptionIds(selectedOptionIds);
  }
  if (answerText !== undefined) {
    data.answerText = normalizeString(answerText);
  }
  return data;
};

/**
 * Map Submit Result Entity
 */
const toSubmitEntity = ({ score, percentage, passed, submittedAt }) => {
  if (score === undefined || score === null) {
    throw new TypeError("score is required.");
  }
  if (percentage === undefined || percentage === null) {
    throw new TypeError("percentage is required.");
  }
  if (typeof passed !== "boolean") {
    throw new TypeError("passed must be a boolean.");
  }
  if (!(submittedAt instanceof Date)) {
    throw new TypeError("submittedAt must be a valid Date.");
  }

  return {
    score,
    percentage,
    passed,
    submittedAt,
  };
};

/**
 * Map Expiration Entity
 */
const toExpireEntity = (expiredAt) => {
  if (!(expiredAt instanceof Date)) {
    throw new TypeError("expiredAt must be a valid Date.");
  }

  return {
    status: "EXPIRED",
  };
};

/**
 * Create Question Snapshot Helper
 */
const createQuestionSnapshot = (assessmentQuestions, attemptId) => {
  return toAttemptQuestionEntities(assessmentQuestions, attemptId);
};

/**
 * Generate cryptographically secure invitation token.
 * Raw token is returned ONLY for delivery to candidate email.
 */
const generateInvitationToken = () => {
  const randomPart = crypto.randomBytes(32).toString("hex");
  return `${INVITATION_TOKEN_PREFIX || "inv_"}${randomPart}`;
};

/**
 * Hash invitation token before database persistence using SHA-256.
 */
const hashInvitationToken = (token) => {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Invitation token must be a non-empty string.");
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
};

/**
 * Create persistence-ready Invitation entity.
 * Raw token is intentionally NOT stored in DB.
 */
const toCreateInvitationEntity = ({
  assessmentId,
  candidateId,
  invitedByUserId,
  email,
  tokenHash,
  expiresAt,
}) => {
  if (!assessmentId) {
    throw new TypeError("assessmentId is required.");
  }
  if (!candidateId) {
    throw new TypeError("candidateId is required.");
  }
  if (!invitedByUserId) {
    throw new TypeError("invitedByUserId is required.");
  }
  if (typeof email !== "string" || !email.trim()) {
    throw new TypeError("email is required.");
  }
  if (typeof tokenHash !== "string" || !tokenHash.trim()) {
    throw new TypeError("tokenHash is required.");
  }
  if (!(expiresAt instanceof Date)) {
    throw new TypeError("expiresAt must be a valid Date.");
  }
  if (expiresAt <= new Date()) {
    throw new TypeError("expiresAt must be in the future.");
  }

  return {
    assessmentId,
    candidateId,
    invitedByUserId,
    email: email.trim().toLowerCase(),
    tokenHash,
    status: "PENDING",
    expiresAt,
  };
};

module.exports = {
  normalizeString,
  normalizeSelectedOptionIds,
  normalizeAnswerText,
  toAttemptAnswerEntity,
  toCreateEntity,
  toAttemptQuestionEntity,
  toAttemptQuestionEntities,
  createQuestionSnapshot,
  toAnswerEntity,
  toAnswerUpdateEntity,
  toSubmitEntity,
  toExpireEntity,
  generateInvitationToken,
  hashInvitationToken,
  hashToken: hashInvitationToken,
  toCreateInvitationEntity,
  createInvitationEntity: toCreateInvitationEntity,
};
