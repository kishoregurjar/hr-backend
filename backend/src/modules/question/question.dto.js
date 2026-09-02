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

    const categories = Array.isArray(question.categories)
      ? question.categories.map((qc) => ({
          id: qc.category?.id || qc.categoryId || qc.id,
          name: qc.category?.name || qc.name,
        }))
      : [];

    const primaryCategory = categories[0] || (question.category ? { id: question.category.id, name: question.category.name } : null);

    return {
      id: question.id,
      title: question.title,
      content: question.content || question.description || "",
      description: question.content || question.description || "",
      explanation: question.explanation || null,
      codeSnippet: question.codeSnippet || null,
      sampleTestCase: question.sampleTestCase || null,
      type: question.type,
      difficulty: question.difficulty,
      status: question.status,
      marks: question.marks !== undefined ? question.marks : 1,
      negativeMarks: question.negativeMarks !== undefined ? question.negativeMarks : 0,
      category: primaryCategory,
      categories,
      tags:
        question.tags?.map((item) => ({
          id: item.tag?.id || item.tagId || item.id,
          name: item.tag?.name || item.name,
        })) ?? [],
      options:
        question.options?.map((option) => ({
          id: option.id,
          optionText: option.optionText || option.text || "",
          text: option.optionText || option.text || "",
          isCorrect: Boolean(option.isCorrect),
          sequence: option.sequence,
        })) ?? [],
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  static toListResponse(question) {
    if (!question) return null;

    const categories = Array.isArray(question.categories)
      ? question.categories.map((qc) => qc.category?.name || qc.name).filter(Boolean)
      : [];
    const categoryName = categories[0] || question.category?.name || null;

    return {
      id: question.id,
      title: question.title,
      content: question.content || question.description || "",
      description: question.content || question.description || "",
      type: question.type,
      difficulty: question.difficulty,
      status: question.status,
      marks: question.marks !== undefined ? question.marks : 1,
      category: categoryName,
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
      content: question.content || question.description || "",
      description: question.content || question.description || "",
      type: question.type,
      marks: question.marks !== undefined ? question.marks : 1,
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
