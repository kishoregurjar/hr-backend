/**
 * ==========================================================
 * Assessment DTO
 * ==========================================================
 * Responsible for transforming persistence-layer entities
 * into safe API response objects.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

class AssessmentDto {
  /**
   * Format User Response
   */
  static toUserResponse(user) {
    if (!user) {
      return null;
    }

    return {
      id: user.id,

      firstName: user.firstName,

      lastName: user.lastName,

      email: user.email,
    };
  }

  /**
   * Format Question Assignment Response
   */
  static toQuestionResponse(assessmentQuestion) {
    if (!assessmentQuestion) {
      return null;
    }

    const question = assessmentQuestion.question;

    return {
      id: assessmentQuestion.id,

      sequence: assessmentQuestion.sequence,

      marks: assessmentQuestion.marks,

      negativeMarks: assessmentQuestion.negativeMarks,

      question: question
        ? {
            id: question.id,

            title: question.title,

            type: question.type,

            difficulty: question.difficulty,

            status: question.status,

            marks: question.marks,
          }
        : null,
    };
  }

  /**
   * Detail Response DTO (Admin / HR)
   */
  static toResponse(assessment) {
    if (!assessment) {
      return null;
    }

    return {
      id: assessment.id,

      title: assessment.title,

      description: assessment.description || null,

      instructions: assessment.instructions || null,

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      maxAttempts: assessment.maxAttempts,

      type: assessment.type,

      difficulty: assessment.difficulty,

      status: assessment.status,

      publishAt: assessment.publishAt || null,

      startsAt: assessment.startsAt || null,

      endsAt: assessment.endsAt || null,

      createdBy: this.toUserResponse(assessment.createdBy),

      questions:
        assessment.questions?.map((item) =>
          this.toQuestionResponse(item)
        ) ?? [],

      createdAt: assessment.createdAt,

      updatedAt: assessment.updatedAt,
    };
  }

  /**
   * List Response DTO (Paginated Listing)
   */
  static toListResponse(assessment) {
    if (!assessment) {
      return null;
    }

    return {
      id: assessment.id,

      title: assessment.title,

      description: assessment.description || null,

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      maxAttempts: assessment.maxAttempts,

      type: assessment.type,

      difficulty: assessment.difficulty,

      status: assessment.status,

      publishAt: assessment.publishAt || null,

      startsAt: assessment.startsAt || null,

      endsAt: assessment.endsAt || null,

      createdAt: assessment.createdAt,

      updatedAt: assessment.updatedAt,
    };
  }

  /**
   * Summary Response DTO (Dropdowns / Selectors)
   */
  static toSummary(assessment) {
    if (!assessment) {
      return null;
    }

    return {
      id: assessment.id,

      title: assessment.title,

      status: assessment.status,

      type: assessment.type,

      difficulty: assessment.difficulty,
    };
  }

  /**
   * Collection Response Helper
   */
  static toCollection(assessments) {
    if (!Array.isArray(assessments)) {
      return [];
    }

    return assessments.map((assessment) =>
      this.toListResponse(assessment)
    );
  }

  /**
   * Question Collection Response Helper
   */
  static toQuestionCollection(questions) {
    if (!Array.isArray(questions)) {
      return [];
    }

    return questions.map((question) =>
      this.toQuestionResponse(question)
    );
  }
}

module.exports = {
  AssessmentDto,
};
