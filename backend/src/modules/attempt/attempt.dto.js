/**
 * ==========================================================
 * Assessment Attempt DTO
 * ==========================================================
 * Responsibilities:
 * - Sanitize Prisma entities for API responses
 * - Prevent internal sensitive fields (isCorrect, explanation,
 *   correctOption, marksAwarded, token, tokenHash) from leaking
 * - Provide candidate-safe and result-safe representations
 * Placed directly at src/modules/attempt/attempt.dto.js
 * matching 100% Zero-Subfolder Pure Option A Standard.
 * ==========================================================
 */

/**
 * Helper to safely serialize Prisma Decimal / Number values
 */
const serializeNumber = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const num = Number(val);
  return isNaN(num) ? val : num;
};

/**
 * Safe User DTO (Exposes minimal profile info)
 */
const toUserResponse = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email ?? null,
  };
};

/**
 * Assessment Summary DTO (Basic details for attempt header)
 */
const toAssessmentSummary = (assessment) => {
  if (!assessment) return null;
  return {
    id: assessment.id,
    title: assessment.title ?? null,
    description: assessment.description ?? null,
    instructions: assessment.instructions ?? null,
    durationMinutes: assessment.durationMinutes ?? null,
    passingScore: assessment.passingScore ?? null,
    maximumScore: assessment.maximumScore ?? null,
    type: assessment.type ?? null,
    difficulty: assessment.difficulty ?? null,
  };
};

/**
 * Candidate Option DTO
 * STRICT SECURITY: Never leaks isCorrect or option explanation
 */
const toCandidateOptionResponse = (option) => {
  if (!option) return null;
  return {
    id: option.id,
    text: option.optionText ?? option.text ?? null,
    sequence: option.sequence ?? null,
  };
};

/**
 * Candidate Question DTO
 * STRICT SECURITY: Excludes answer key & explanation
 */
const toCandidateQuestionResponse = (attemptQuestion) => {
  if (!attemptQuestion) return null;
  const question = attemptQuestion.question || null;

  return {
    id: attemptQuestion.id,
    questionId: attemptQuestion.questionId,
    sequence: attemptQuestion.sequence,
    marks: serializeNumber(attemptQuestion.marks),
    negativeMarks: serializeNumber(attemptQuestion.negativeMarks),
    question: question
      ? {
          id: question.id,
          title: question.title ?? null,
          description: question.description ?? null,
          type: question.type ?? null,
          difficulty: question.difficulty ?? null,
          options: Array.isArray(question.options)
            ? question.options.map(toCandidateOptionResponse)
            : [],
        }
      : null,
  };
};

/**
 * ------------------------------------------------------------
 * Candidate Answer Response
 * ------------------------------------------------------------
 * STRICT SECURITY:
 * isCorrect        ❌
 * evaluationStatus ❌
 * marksAwarded     ❌
 * correctAnswer    ❌
 * ------------------------------------------------------------
 */
const toCandidateAnswerResponse = (answer) => {
  if (!answer) {
    return null;
  }

  return {
    id: answer.id,
    attemptId: answer.attemptId ?? null,
    questionId: answer.questionId,
    selectedOptionIds: Array.isArray(answer.selectedOptionIds)
      ? answer.selectedOptionIds
      : [],
    answerText: answer.answerText ?? null,
    updatedAt: answer.updatedAt ?? null,
  };
};

/**
 * Evaluated Question Response DTO (Post-Submission / Internal Result)
 */
const toEvaluatedQuestionResponse = (attemptQuestion, answer) => {
  if (!attemptQuestion) return null;
  return {
    id: attemptQuestion.id,
    questionId: attemptQuestion.questionId,
    sequence: attemptQuestion.sequence,
    marks: serializeNumber(attemptQuestion.marks),
    negativeMarks: serializeNumber(attemptQuestion.negativeMarks),
    answer: answer
      ? {
          id: answer.id,
          selectedOptionIds: answer.selectedOptionIds ?? null,
          answerText: answer.answerText ?? null,
          evaluationStatus: answer.evaluationStatus ?? null,
          isCorrect: answer.isCorrect ?? null,
          marksAwarded: serializeNumber(answer.marksAwarded),
          answeredAt: answer.answeredAt ?? null,
          updatedAt: answer.updatedAt ?? null,
        }
      : null,
  };
};

/**
 * Candidate Active Attempt DTO (For active test window)
 * STRICT SECURITY: Excludes score, percentage, passed status while IN_PROGRESS
 */
const toCandidateResponse = (attempt) => {
  if (!attempt) return null;
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt ?? null,
    cancelledAt: attempt.cancelledAt ?? null,
    questions: Array.isArray(attempt.questions)
      ? attempt.questions.map(toCandidateQuestionResponse)
      : [],
    answers: Array.isArray(attempt.answers)
      ? attempt.answers.map(toCandidateAnswerResponse)
      : [],
    assessment: toAssessmentSummary(attempt.assessment),
  };
};

/**
 * Attempt Summary DTO (For attempt history listing)
 */
const toSummary = (attempt) => {
  if (!attempt) return null;
  const isSubmitted = attempt.status === "SUBMITTED";

  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt ?? null,
    score: isSubmitted ? serializeNumber(attempt.score) : null,
    percentage: isSubmitted ? serializeNumber(attempt.percentage) : null,
    passed: isSubmitted ? (attempt.passed ?? null) : null,
  };
};

/**
 * Result Response DTO (For completed attempts)
 */
const toResultResponse = (attempt) => {
  if (!attempt) return null;
  return {
    id: attempt.id,
    assessmentId: attempt.assessmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt ?? null,
    score: serializeNumber(attempt.score),
    percentage: serializeNumber(attempt.percentage),
    passed: attempt.passed ?? null,
    questions: Array.isArray(attempt.questions)
      ? attempt.questions.map((attemptQuestion) => {
          const answer = Array.isArray(attempt.answers)
            ? attempt.answers.find((item) => item.questionId === attemptQuestion.questionId)
            : null;
          return toEvaluatedQuestionResponse(attemptQuestion, answer);
        })
      : [],
  };
};

/**
 * Candidate Invitation DTO
 * RAW TOKEN AND TOKEN HASH ARE NEVER EXPOSED IN RESPONSES.
 */
const toInvitationResponse = (invitation) => {
  if (!invitation) return null;
  const res = {
    id: invitation.id,
    assessmentId: invitation.assessmentId,
    candidateId: invitation.candidateId,
    email: invitation.email,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };

  if (invitation.rawToken) {
    res.token = invitation.rawToken;
    res.assessmentLink = `${process.env.CLIENT_URL || "http://localhost:3000"}/take-test?token=${invitation.rawToken}`;
  }

  return res;
};

/**
 * Bulk Invitation Response DTO
 * STRICT SECURITY: rawToken and tokenHash are 100% excluded
 */
const toBulkInvitationResponse = (result) => {
  if (!result) return null;

  return {
    summary: {
      total: result.summary.total,
      created: result.summary.created,
      duplicate: result.summary.duplicate,
      failed: result.summary.failed,
    },
    results: result.results.map((item) => ({
      candidateId: item.candidateId,
      status: item.status,
      code: item.code ?? null,
      invitationId: item.invitationId ?? null,
      email: item.email ?? null,
      message: item.message ?? null,
    })),
  };
};

/**
 * Collection DTOs
 */
const toCollection = (attempts) => {
  if (!Array.isArray(attempts)) return [];
  return attempts.map(toSummary);
};

const toCandidateCollection = (attempts) => {
  if (!Array.isArray(attempts)) return [];
  return attempts.map(toCandidateResponse);
};

/**
 * ------------------------------------------------------------
 * Helper: Normalize Selected Option IDs for JSON
 * ------------------------------------------------------------
 */
const normalizeSelectedOptionIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((id) => typeof id === "string");
};

/**
 * ------------------------------------------------------------
 * Candidate-Safe Attempt Question DTO
 * ------------------------------------------------------------
 * Strips sensitive evaluation fields:
 * - isCorrect
 * - correctAnswer
 * - explanation
 * - evaluationStatus
 * - score
 * - negativeMarks
 * - internal audit fields
 * ------------------------------------------------------------
 */
const toCandidateAttemptQuestionDto = (question) => {
  if (!question) {
    return null;
  }

  const baseQuestion = question.question || question;

  return {
    questionId: question.questionId || baseQuestion.id || question.id,
    sequence: question.sequence ?? 1,
    title: baseQuestion.title || question.title,
    description: baseQuestion.description || baseQuestion.content || question.description || null,
    type: baseQuestion.type || question.type,
    difficulty: baseQuestion.difficulty || question.difficulty,
    marks: serializeNumber(question.marks ?? baseQuestion.marks),
    options: (baseQuestion.options || question.options || []).map((option) => ({
      id: option.id,
      text: option.optionText ?? option.text ?? null,
      sequence: option.sequence,
    })),
  };
};

/**
 * ------------------------------------------------------------
 * Helper: Candidate Answer DTO
 * ------------------------------------------------------------
 */
const toCandidateAnswer = (answer) => {
  if (!answer) {
    return null;
  }

  return {
    id: answer.id,
    questionId: answer.questionId,
    selectedOptionIds: normalizeSelectedOptionIds(answer.selectedOptionIds),
    answerText: answer.answerText ?? null,
    version: answer.version ?? 1,
    updatedAt: answer.updatedAt ?? null,
  };
};

/**
 * ------------------------------------------------------------
 * Candidate Current Attempt DTO
 * ------------------------------------------------------------
 * SECURITY:
 * NEVER expose:
 * - isCorrect
 * - explanation
 * - evaluationStatus
 * - marksAwarded
 * - correctOptionIds
 * - internal audit fields
 * ------------------------------------------------------------
 */
const toCandidateCurrentAttemptResponse = (attempt, serverTime = new Date().toISOString()) => {
  if (!attempt) {
    return null;
  }

  return {
    id: attempt.id,
    attemptId: attempt.id,
    assessmentId: attempt.assessmentId,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt ?? null,
    serverTime: serverTime instanceof Date ? serverTime.toISOString() : (serverTime || new Date().toISOString()),
    assessment: attempt.assessment
      ? {
          id: attempt.assessment.id,
          title: attempt.assessment.title,
          description: attempt.assessment.description ?? null,
          durationMinutes: attempt.assessment.durationMinutes,
          passingScore: serializeNumber(attempt.assessment.passingScore),
          maximumScore: serializeNumber(attempt.assessment.maximumScore),
          type: attempt.assessment.type,
          difficulty: attempt.assessment.difficulty,
        }
      : null,
    questions: (attempt.questions || attempt.attemptQuestions || []).map((attemptQuestion) => ({
      id: attemptQuestion.id,
      questionId: attemptQuestion.questionId,
      sequence: attemptQuestion.sequence,
      marks: serializeNumber(attemptQuestion.marks),
      negativeMarks: serializeNumber(attemptQuestion.negativeMarks),
      question: attemptQuestion.question
        ? {
            id: attemptQuestion.question.id,
            title: attemptQuestion.question.title,
            description: attemptQuestion.question.description ?? null,
            type: attemptQuestion.question.type,
            difficulty: attemptQuestion.question.difficulty,
            options: (attemptQuestion.question.options || []).map((option) => ({
              id: option.id,
              text: option.optionText ?? option.text ?? null,
              sequence: option.sequence,
            })),
          }
        : null,
      answer: toCandidateAnswer(attemptQuestion.answers?.[0] || attemptQuestion.answer),
    })),
    answers: (attempt.answers || []).map(toCandidateAnswer),
  };
};

const toCandidateSubmissionResponse = (result) => {
  if (!result) {
    return null;
  }

  return {
    attemptId: result.attemptId,
    status: result.status,
    submittedAt: result.submittedAt,
    finalScore: serializeNumber(result.finalScore),
    maximumScore: serializeNumber(result.maximumScore),
    percentage: serializeNumber(result.percentage),
    passingScore: serializeNumber(result.passingScore),
    result: result.result,
    correctCount: result.correctCount,
    incorrectCount: result.incorrectCount,
    unansweredCount: result.unansweredCount,
  };
};

const toHrResultListItem = (attempt) => {
  return {
    attemptId: attempt.id,
    candidate: {
      id: attempt.candidate.id,
      firstName: attempt.candidate.firstName,
      lastName: attempt.candidate.lastName,
      fullName: [attempt.candidate.firstName, attempt.candidate.lastName]
        .filter(Boolean)
        .join(" "),
      email: attempt.candidate.email,
    },
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score !== null ? Number(attempt.score) : null,
    percentage: attempt.percentage !== null ? Number(attempt.percentage) : null,
    passed: attempt.passed,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
};

const toHrAnalyticsResponse = ({
  assessment,
  statusCounts,
  scoreAggregate,
  passFail,
}) => {
  const totalAttempts = statusCounts.reduce(
    (total, item) => total + item._count._all,
    0
  );

  const submittedAttempts =
    statusCounts.find((item) => item.status === "SUBMITTED")?._count._all || 0;

  const inProgressAttempts =
    statusCounts.find((item) => item.status === "IN_PROGRESS")?._count._all || 0;

  const expiredAttempts =
    statusCounts.find((item) => item.status === "EXPIRED")?._count._all || 0;

  const cancelledAttempts =
    statusCounts.find((item) => item.status === "CANCELLED")?._count._all || 0;

  const averageScore =
    scoreAggregate._avg.score !== null
      ? Number(scoreAggregate._avg.score)
      : null;

  const averagePercentage =
    scoreAggregate._avg.percentage !== null
      ? Number(scoreAggregate._avg.percentage)
      : null;

  const passRate =
    submittedAttempts > 0
      ? Number(((passFail.passed / submittedAttempts) * 100).toFixed(2))
      : 0;

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      status: assessment.status,
      type: assessment.type,
      difficulty: assessment.difficulty,
      passingScore: assessment.passingScore,
      maximumScore: assessment.maximumScore,
      durationMinutes: assessment.durationMinutes,
    },
    attempts: {
      total: totalAttempts,
      submitted: submittedAttempts,
      inProgress: inProgressAttempts,
      expired: expiredAttempts,
      cancelled: cancelledAttempts,
    },
    performance: {
      passed: passFail.passed,
      failed: passFail.failed,
      passRate,
      averageScore,
      averagePercentage,
      minimumScore:
        scoreAggregate._min.score !== null
          ? Number(scoreAggregate._min.score)
          : null,
      maximumScore:
        scoreAggregate._max.score !== null
          ? Number(scoreAggregate._max.score)
          : null,
    },
  };
};

const toQuestionPerformanceResponse = (rows) => {
  const map = new Map();

  for (const row of rows) {
    const key = row.questionId;

    if (!map.has(key)) {
      map.set(key, {
        questionId: row.questionId,
        sequence: row.sequence,
        title: row.question.title,
        type: row.question.type,
        difficulty: row.question.difficulty,
        totalAttempts: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
      });
    }

    const item = map.get(key);

    /**
     * Each submitted attempt/question
     * represents one opportunity.
     */
    item.totalAttempts += 1;

    const answer = row.answers?.[0];

    if (!answer) {
      item.unanswered += 1;
      continue;
    }

    if (answer.evaluationStatus === "CORRECT") {
      item.correct += 1;
    } else if (answer.evaluationStatus === "INCORRECT") {
      item.incorrect += 1;
    } else {
      item.unanswered += 1;
    }
  }

  return Array.from(map.values()).map((item) => ({
    ...item,
    correctRate:
      item.totalAttempts > 0
        ? Number(((item.correct / item.totalAttempts) * 100).toFixed(2))
        : 0,
    incorrectRate:
      item.totalAttempts > 0
        ? Number(((item.incorrect / item.totalAttempts) * 100).toFixed(2))
        : 0,
    unansweredRate:
      item.totalAttempts > 0
        ? Number(((item.unanswered / item.totalAttempts) * 100).toFixed(2))
        : 0,
  }));
};

const toHrAttemptResultResponse = (attempt) => {
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score !== null ? Number(attempt.score) : null,
    percentage: attempt.percentage !== null ? Number(attempt.percentage) : null,
    passed: attempt.passed,

    candidate: {
      id: attempt.candidate.id,
      firstName: attempt.candidate.firstName,
      lastName: attempt.candidate.lastName,
      email: attempt.candidate.email,
    },

    assessment: {
      id: attempt.assessment.id,
      title: attempt.assessment.title,
      passingScore: attempt.assessment.passingScore,
      maximumScore: attempt.assessment.maximumScore,
      durationMinutes: attempt.assessment.durationMinutes,
      type: attempt.assessment.type,
      difficulty: attempt.assessment.difficulty,
    },

    questions: attempt.questions.map((attemptQuestion) => {
      const answer = attemptQuestion.answers?.[0] || null;

      return {
        questionId: attemptQuestion.questionId,
        sequence: attemptQuestion.sequence,
        marks: Number(attemptQuestion.marks),
        negativeMarks: Number(attemptQuestion.negativeMarks),

        question: {
          id: attemptQuestion.question.id,
          title: attemptQuestion.question.title,
          type: attemptQuestion.question.type,
          difficulty: attemptQuestion.question.difficulty,
        },

        answer: answer
          ? {
              selectedOptionIds: Array.isArray(answer.selectedOptionIds)
                ? answer.selectedOptionIds
                : [],
              answerText: answer.answerText,
              evaluationStatus: answer.evaluationStatus,
              isCorrect: answer.isCorrect,
              marksAwarded:
                answer.marksAwarded !== null
                  ? Number(answer.marksAwarded)
                  : null,
              answeredAt: answer.answeredAt,
              updatedAt: answer.updatedAt,
            }
          : null,
      };
    }),
  };
};

const toHRAttemptListResponse = (attempt) => {
  if (!attempt) return null;
  const candidate = attempt.candidate || attempt.candidateAssessment?.candidate;
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    expiresAt: attempt.expiresAt,
    score: attempt.score !== null && attempt.score !== undefined ? Number(attempt.score) : null,
    percentage: attempt.percentage !== null && attempt.percentage !== undefined ? Number(attempt.percentage) : null,
    passed: attempt.passed ?? null,
    candidate: candidate
      ? {
          id: candidate.id,
          name: `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() || candidate.email || null,
          firstName: candidate.firstName ?? null,
          lastName: candidate.lastName ?? null,
          email: candidate.email ?? null,
        }
      : null,
    assessment: attempt.assessment
      ? {
          id: attempt.assessment.id,
          title: attempt.assessment.title ?? null,
          maximumScore: attempt.assessment.maximumScore ?? null,
          passingScore: attempt.assessment.passingScore ?? null,
        }
      : null,
  };
};

const toAssessmentAnalyticsResponse = (analytics) => {
  if (!analytics) return null;
  return {
    attempts: {
      total: analytics.attempts?.total || 0,
      submitted: analytics.attempts?.submitted || 0,
      completionRate: analytics.attempts?.completionRate || 0,
    },
    results: {
      passed: analytics.results?.passed || 0,
      failed: analytics.results?.failed || 0,
      passRate: analytics.results?.passRate || 0,
    },
    scores: {
      average: analytics.scores?.average || 0,
      averagePercentage: analytics.scores?.averagePercentage || 0,
      highest: analytics.scores?.highest || 0,
      lowest: analytics.scores?.lowest || 0,
    },
  };
};

const toHRAttemptDetailResponse = (attempt) => {
  if (!attempt) return null;
  const candidate = attempt.candidate || attempt.candidateAssessment?.candidate;
  return {
    id: attempt.id,
    status: attempt.status,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    expiresAt: attempt.expiresAt,
    score: attempt.score !== null && attempt.score !== undefined ? Number(attempt.score) : null,
    percentage: attempt.percentage !== null && attempt.percentage !== undefined ? Number(attempt.percentage) : null,
    passed: attempt.passed ?? null,
    candidate: candidate
      ? {
          id: candidate.id,
          name: `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() || candidate.email || null,
          firstName: candidate.firstName ?? null,
          lastName: candidate.lastName ?? null,
          email: candidate.email ?? null,
        }
      : null,
    questions: Array.isArray(attempt.questions)
      ? attempt.questions.map((q) => {
          const answer = q.answers?.[0] || null;
          return {
            id: q.id,
            sequence: q.sequence,
            marks: Number(q.marks),
            negativeMarks: Number(q.negativeMarks),
            answer: answer
              ? {
                  selectedOptionIds: answer.selectedOptionIds,
                  answerText: answer.answerText,
                  evaluationStatus: answer.evaluationStatus,
                  marksAwarded: answer.marksAwarded !== null && answer.marksAwarded !== undefined ? Number(answer.marksAwarded) : null,
                }
              : null,
          };
        })
      : [],
  };
};

module.exports = {
  serializeNumber,
  toUserResponse,
  toAssessmentSummary,
  toCandidateOptionResponse,
  toCandidateQuestionResponse,
  toCandidateAnswerResponse,
  toEvaluatedQuestionResponse,
  toCandidateResponse,
  toSummary,
  toResultResponse,
  toInvitationResponse,
  toBulkInvitationResponse,
  toCollection,
  toCandidateCollection,
  toCandidateCurrentAttemptResponse,
  toCandidateSubmissionResponse,
  toHrResultListItem,
  toHrAnalyticsResponse,
  toQuestionPerformanceResponse,
  toHrAttemptResultResponse,
  toHRAttemptListResponse,
  toAssessmentAnalyticsResponse,
  toHRAttemptDetailResponse,
  toCandidateAttemptQuestionDto,
};
