/**
 * ==========================================================
 * Question Data Transfer Object (DTO)
 * ==========================================================
 * Sanitizes and formats Question database models into client-safe payloads.
 * Includes separate DTOs for Admin and Candidate assessment security.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class QuestionDto {
  static toResponse(question) {
    if (!question) return null;

    return {
      id: question.id,
      title: question.title,
      description: question.description || null,
      explanation: question.explanation || null,
      type: question.type,
      difficulty: question.difficulty,
      status: question.status,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
      estimatedTime: question.estimatedTime || null,
      shuffleOptions: question.shuffleOptions,
      category: question.category
        ? {
            id: question.category.id,
            name: question.category.name,
          }
        : null,
      tags:
        question.tags?.map((item) => ({
          id: item.tag?.id || item.id,
          name: item.tag?.name || item.name,
        })) ?? [],
      options:
        question.options?.map((option) => ({
          id: option.id,
          text: option.optionText || option.text,
          isCorrect: option.isCorrect,
          sequence: option.sequence,
        })) ?? [],
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  static toListResponse(question) {
    if (!question) return null;

    return {
      id: question.id,
      title: question.title,
      type: question.type,
      difficulty: question.difficulty,
      status: question.status,
      marks: question.marks,
      category: question.category?.name ?? null,
      createdAt: question.createdAt,
    };
  }

  static toSummary(question) {
    if (!question) return null;

    return {
      id: question.id,
      title: question.title,
    };
  }

  static toCollection(questions) {
    if (!Array.isArray(questions)) return [];
    return questions.map((question) => QuestionDto.toListResponse(question));
  }
}

class CandidateQuestionDto {
  static toResponse(question) {
    if (!question) return null;

    return {
      id: question.id,
      title: question.title,
      description: question.description || null,
      type: question.type,
      marks: question.marks,
      shuffleOptions: question.shuffleOptions,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({
            id: option.id,
            text: option.optionText || option.text,
            sequence: option.sequence,
          }))
        : [],
    };
  }
}

module.exports = {
  QuestionDto,
  CandidateQuestionDto,
};
