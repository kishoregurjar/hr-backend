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

    const nameParts = (user.name || "").split(" ");
    const firstName = user.firstName || nameParts[0] || "";
    const lastName = user.lastName || nameParts.slice(1).join(" ") || "";

    return {
      id: user.id,

      name: user.name,

      firstName,

      lastName,

      fullName: user.name || `${firstName} ${lastName}`.trim(),

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
      id: assessmentQuestion.questionId || assessmentQuestion.id,

      assessmentId: assessmentQuestion.assessmentId,

      questionId: assessmentQuestion.questionId || assessmentQuestion.id,

      orderIndex: assessmentQuestion.orderIndex !== undefined ? assessmentQuestion.orderIndex : assessmentQuestion.sequence,

      sequence: assessmentQuestion.orderIndex !== undefined ? assessmentQuestion.orderIndex : assessmentQuestion.sequence,

      points: assessmentQuestion.points !== undefined ? assessmentQuestion.points : assessmentQuestion.marks,

      marks: assessmentQuestion.points !== undefined ? assessmentQuestion.points : assessmentQuestion.marks,

      negativePoints: assessmentQuestion.negativePoints !== undefined ? assessmentQuestion.negativePoints : assessmentQuestion.negativeMarks,

      negativeMarks: assessmentQuestion.negativePoints !== undefined ? assessmentQuestion.negativePoints : assessmentQuestion.negativeMarks,

      question: question
        ? {
            id: question.id,

            title: question.title,

            content: question.content || question.description || "",

            description: question.content || question.description || "",

            type: question.type,

            difficulty: question.difficulty,

            status: question.status,
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

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      type: assessment.type,

      status: assessment.status,

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

      type: assessment.type,

      status: assessment.status,

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
