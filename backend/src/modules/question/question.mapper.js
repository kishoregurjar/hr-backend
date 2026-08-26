/**
 * ==========================================================
 * Question Data Mapper
 * ==========================================================
 * Converts HTTP request objects into persistence-ready entities.
 * Includes normalizeTitle, toCreateEntity, toUpdateEntity, toOptionEntities,
 * toQuestionTagEntities, toAuditPayload, and toVersionSnapshot.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

class QuestionMapper {
  static normalizeTitle(title) {
    if (typeof title !== "string") return "";
    return title
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  static toCreateEntity(data, userId) {
    return {
      title: data.title.trim().replace(/\s+/g, " "),
      description: data.description ? data.description.trim() : null,
      explanation: data.explanation ? data.explanation.trim() : null,
      type: data.type,
      difficulty: data.difficulty,
      status: data.status || "DRAFT",
      marks: data.marks !== undefined ? data.marks : 1,
      negativeMarks: data.negativeMarks !== undefined ? data.negativeMarks : 0,
      estimatedTime: data.estimatedTime || null,
      shuffleOptions: data.shuffleOptions !== undefined ? data.shuffleOptions : true,
      categoryId: data.categoryId || null,
      createdById: userId,
      updatedById: userId,
    };
  }

  static toOptionEntities(optionsData = [], questionId = null) {
    if (!Array.isArray(optionsData)) return [];

    return optionsData.map((opt, index) => ({
      ...(questionId && { questionId }),
      optionText: (opt.optionText || opt.text || "").trim(),
      isCorrect: Boolean(opt.isCorrect),
      sequence: opt.sequence || index + 1,
      explanation: opt.explanation ? opt.explanation.trim() : null,
    }));
  }

  static toQuestionTagEntities(tagIds = [], questionId = null) {
    if (!Array.isArray(tagIds)) return [];
    if (questionId) {
      return tagIds.map((tagId) => ({
        questionId,
        tagId,
      }));
    }
    return tagIds.map((tagId) => ({
      tag: { connect: { id: tagId } },
    }));
  }

  static toUpdateEntity(data, userId) {
    const payload = {
      updatedById: userId,
    };

    if (data.title) {
      payload.title = data.title.trim().replace(/\s+/g, " ");
    }
    if (data.description !== undefined) {
      payload.description = data.description ? data.description.trim() : null;
    }
    if (data.explanation !== undefined) {
      payload.explanation = data.explanation ? data.explanation.trim() : null;
    }
    if (data.type) payload.type = data.type;
    if (data.difficulty) payload.difficulty = data.difficulty;
    if (data.status) payload.status = data.status;
    if (data.marks !== undefined) payload.marks = data.marks;
    if (data.negativeMarks !== undefined) payload.negativeMarks = data.negativeMarks;
    if (data.estimatedTime !== undefined) payload.estimatedTime = data.estimatedTime || null;
    if (data.shuffleOptions !== undefined) payload.shuffleOptions = Boolean(data.shuffleOptions);
    if (data.categoryId !== undefined) payload.categoryId = data.categoryId || null;

    return payload;
  }

  static toAuditPayload(question, action) {
    return {
      entity: "QUESTION",
      entityId: question.id,
      action,
      snapshot: QuestionMapper.toVersionSnapshot(question),
    };
  }

  static toVersionSnapshot(question) {
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
      version: question.version,
      categoryId: question.categoryId,
      options: Array.isArray(question.options)
        ? question.options.map((o) => ({
            optionText: o.optionText || o.text,
            isCorrect: o.isCorrect,
            sequence: o.sequence,
          }))
        : [],
      tags: Array.isArray(question.tags)
        ? question.tags.map((t) => t.tag?.name || t.name)
        : [],
    };
  }
}

module.exports = {
  QuestionMapper,
};
