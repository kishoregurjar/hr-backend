const { prisma } = require("../../config/prisma");
const { ConflictError, NotFoundError, BadRequestError } = require("../../common/errors");
const { runTransaction } = require("../../common/transaction");
const logger = require("../../config/logger");
const questionRepository = require("./question.repository");
const { QuestionMapper } = require("./question.mapper");
const { QuestionDto } = require("./question.dto");
const { QUESTION_STATUS } = require("./question.constants");

/**
 * ==========================================================
 * Question Service
 * ==========================================================
 * Single Domain Service class handling all Question Bank operations.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class QuestionService {
  async createQuestion(payload, userId, companyId = null) {
    const title = QuestionMapper.normalizeTitle(payload.title);
    logger.info({ userId, companyId, title }, "Initiating question creation");

    const existingQuestion = await questionRepository.findByTitle(title, companyId);
    if (existingQuestion) {
      throw new ConflictError("Question with this title already exists.", "QUESTION_TITLE_EXISTS");
    }

    const createdQuestion = await runTransaction(async (tx) => {
      const questionData = QuestionMapper.toCreateEntity(payload, userId, companyId);
      const optionsData = QuestionMapper.toOptionEntities(payload.options);
      const tagIds = payload.tagIds || [];

      return questionRepository.create(tx, questionData, optionsData, tagIds);
    });

    return {
      message: "Question created successfully.",
      data: QuestionDto.toResponse(createdQuestion),
    };
  }

  async getQuestions(query = {}, companyId = null) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 100));
    const search = query.search?.trim();
    const type = query.type;
    const difficulty = query.difficulty;
    const status = query.status;
    const categoryId = query.categoryId;

    const { data: questions, total } = await questionRepository.listPaginated({
      page,
      limit,
      search,
      type,
      difficulty,
      status,
      categoryId,
      companyId: companyId || query.companyId || null,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      message: "Questions retrieved successfully.",
      data: QuestionDto.toCollection(questions),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getQuestionById(id) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    return {
      message: "Question fetched successfully.",
      data: QuestionDto.toResponse(question),
    };
  }

  async updateQuestion(id, payload, userId, companyId = null) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    if (payload.title) {
      const title = QuestionMapper.normalizeTitle(payload.title);
      const existing = await questionRepository.findByTitle(title, companyId || question.companyId);
      if (existing && existing.id !== id) {
        throw new ConflictError("Question with this title already exists.", "QUESTION_TITLE_EXISTS");
      }
    }

    const updateData = QuestionMapper.toUpdateEntity(payload, userId);
    const optionsData = payload.options ? QuestionMapper.toOptionEntities(payload.options, id) : null;
    const tagIds = payload.tagIds ? payload.tagIds : null;

    const updatedQuestion = await runTransaction(async (tx) => {
      return questionRepository.update(tx, id, updateData, optionsData, tagIds);
    });

    return {
      message: "Question updated successfully.",
      data: QuestionDto.toResponse(updatedQuestion),
    };
  }

  async deleteQuestion(id, userId) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    const result = await runTransaction(async (tx) => {
      const answerCount = await questionRepository.countCandidateAnswers(tx, id);
      const attemptQuestionCount = await questionRepository.countAttemptQuestions(tx, id);

      if (answerCount > 0 || attemptQuestionCount > 0) {
        const archived = await questionRepository.archive(tx, id);
        return { action: "ARCHIVED", question: archived };
      }

      const deleted = await questionRepository.hardDeleteCascade(tx, id);
      return { action: "DELETED", question: deleted };
    });

    return {
      message: result.action === "ARCHIVED"
        ? "Question archived because it is linked to candidate test history."
        : "Question deleted successfully.",
      data: { id: result.question.id, action: result.action },
    };
  }

  async bulkDeleteQuestions(ids = [], userId, companyId = null) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("No question IDs provided for deletion.", "INVALID_BULK_DELETE");
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (questions.length === 0) {
      return { message: "No matching questions found to delete.", count: 0, deletedCount: 0, archivedCount: 0 };
    }

    const questionIds = questions.map((q) => q.id);

    // Safely check which questions have candidate test links
    const answers = await prisma.candidateAnswer.findMany({
      where: { questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const attemptQuestions = await prisma.attemptQuestion.findMany({
      where: { questionId: { in: questionIds } },
      select: { questionId: true },
    });

    const linkedSet = new Set([
      ...answers.map((a) => a.questionId),
      ...attemptQuestions.map((aq) => aq.questionId),
    ]);

    const toArchiveIds = questionIds.filter((id) => linkedSet.has(id));
    const toDeleteIds = questionIds.filter((id) => !linkedSet.has(id));

    let deletedCount = 0;
    let archivedCount = 0;

    await runTransaction(async (tx) => {
      if (toArchiveIds.length > 0) {
        const archived = await tx.question.updateMany({
          where: { id: { in: toArchiveIds } },
          data: { status: "ARCHIVED" },
        });
        archivedCount = archived.count;
      }

      if (toDeleteIds.length > 0) {
        deletedCount = await questionRepository.hardDeleteManyCascade(tx, toDeleteIds);
      }
    });

    const totalProcessed = deletedCount + archivedCount;
    return {
      message: totalProcessed === 1
        ? "1 question processed successfully."
        : `${totalProcessed} questions processed successfully (${deletedCount} deleted, ${archivedCount} archived).`,
      deletedCount,
      archivedCount,
      totalCount: totalProcessed,
    };
  }

  async deleteAllQuestions(userId, companyId = null) {
    const where = {};
    if (companyId) {
      where.OR = [
        { companyId },
        { companyId: null },
        { createdBy: { companyMembers: { some: { companyId } } } },
      ];
    }

    const all = await prisma.question.findMany({
      where,
      select: { id: true },
    });

    const ids = all.map((q) => q.id);
    if (!ids.length) {
      return { message: "No questions found to delete.", count: 0, deletedCount: 0, archivedCount: 0, totalCount: 0 };
    }

    return this.bulkDeleteQuestions(ids, userId, companyId);
  }

  async publishQuestion(id, userId) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    if (question.status === QUESTION_STATUS.PUBLISHED) {
      throw new ConflictError("Question is already published.", "QUESTION_ALREADY_PUBLISHED");
    }

    const publishedQuestion = await runTransaction(async (tx) => {
      return questionRepository.publish(tx, id);
    });

    return {
      message: "Question published successfully.",
      data: QuestionDto.toResponse(publishedQuestion),
    };
  }

  async archiveQuestion(id, userId) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    if (question.status === QUESTION_STATUS.ARCHIVED) {
      throw new ConflictError("Question is already archived.", "QUESTION_ALREADY_ARCHIVED");
    }

    const archivedQuestion = await runTransaction(async (tx) => {
      return questionRepository.archive(tx, id);
    });

    return {
      message: "Question archived successfully.",
      data: QuestionDto.toResponse(archivedQuestion),
    };
  }

  async bulkCreateQuestions(questionsList, userId, companyId = null) {
    if (!Array.isArray(questionsList) || questionsList.length === 0) {
      throw new BadRequestError("A non-empty list of questions is required.");
    }

    const created = [];
    const skipped = [];
    const errors = [];

    // 1. Pre-cache existing categories & tags in 1 batch
    const existingCategories = await prisma.category.findMany();
    const categoryMap = new Map();
    existingCategories.forEach((c) => {
      categoryMap.set(c.id, c);
      categoryMap.set(c.name.toLowerCase().trim(), c);
    });

    const existingTags = await prisma.tag.findMany();
    const tagMap = new Map();
    existingTags.forEach((t) => {
      tagMap.set(t.id, t);
      tagMap.set(t.name.toLowerCase().trim(), t);
    });

    // 2. Batch resolve missing categories upfront (parallel, non-blocking)
    const missingCategoryNames = new Set();
    questionsList.forEach((q) => {
      if (q.category && !q.categoryId) {
        const catName = String(q.category).trim();
        if (catName && !categoryMap.has(catName.toLowerCase())) {
          missingCategoryNames.add(catName);
        }
      }
    });

    if (missingCategoryNames.size > 0) {
      await Promise.all(
        Array.from(missingCategoryNames).map(async (name) => {
          try {
            const cat = await prisma.category.upsert({
              where: { name },
              update: {},
              create: { name },
            });
            categoryMap.set(cat.id, cat);
            categoryMap.set(cat.name.toLowerCase().trim(), cat);
          } catch {}
        })
      );
    }

    // 3. Batch resolve missing tags upfront (parallel, non-blocking)
    const missingTagNames = new Set();
    questionsList.forEach((q) => {
      const rawTags = Array.isArray(q.tags)
        ? q.tags
        : typeof q.tags === "string"
        ? q.tags.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      rawTags.forEach((t) => {
        const str = typeof t === "object" ? t.name || t.id : String(t).trim();
        if (str && !tagMap.has(str.toLowerCase()) && !tagMap.has(str)) {
          missingTagNames.add(str);
        }
      });
    });

    if (missingTagNames.size > 0) {
      await Promise.all(
        Array.from(missingTagNames).map(async (name) => {
          try {
            const tag = await prisma.tag.upsert({
              where: { name },
              update: {},
              create: { name },
            });
            tagMap.set(tag.id, tag);
            tagMap.set(tag.name.toLowerCase().trim(), tag);
          } catch {}
        })
      );
    }

    // 4. Pre-fetch existing question titles in 1 batch query (Case-Insensitive & Space-Resilient)
    const existingQuestions = await prisma.question.findMany({
      where: {
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      select: { title: true },
    });

    const existingTitleSet = new Set(
      existingQuestions.map((q) => QuestionMapper.normalizeTitle(q.title)).filter(Boolean)
    );

    // 5. Ingest questions with in-memory resolution & lean atomic database writes
    for (let i = 0; i < questionsList.length; i++) {
      const item = questionsList[i];
      const rawTitle = item.title || item.question || "";
      const normalizedTitle = QuestionMapper.normalizeTitle(rawTitle);

      if (!normalizedTitle || normalizedTitle.length < 5) {
        errors.push({
          index: i,
          title: rawTitle || `Row #${i + 1}`,
          reason: "Question title must be at least 5 characters.",
        });
        continue;
      }

      // Check duplicate in-memory (0 DB round trips, 100% Case-Insensitive)
      if (existingTitleSet.has(normalizedTitle)) {
        skipped.push({
          index: i,
          title: rawTitle,
          reason: "Question with this title already exists in company question bank.",
        });
        continue;
      }

      try {
        // Resolve Category in-memory (0 DB round trips)
        let categoryId = item.categoryId;
        if (!categoryId && item.category) {
          const catKey = String(item.category).toLowerCase().trim();
          categoryId = categoryMap.get(catKey)?.id || categoryMap.get(String(item.category).trim())?.id;
        }
        if (!categoryId) {
          categoryId = categoryMap.get("general")?.id || existingCategories[0]?.id;
        }

        // Resolve Tags in-memory (0 DB round trips)
        const resolvedTagIds = [];
        const rawTags = Array.isArray(item.tags)
          ? item.tags
          : typeof item.tags === "string"
          ? item.tags.split(",").map((s) => s.trim()).filter(Boolean)
          : Array.isArray(item.tagIds)
          ? item.tagIds
          : [];

        for (const tagInput of rawTags) {
          const tagStr = typeof tagInput === "object" ? tagInput.name || tagInput.id : String(tagInput).trim();
          if (!tagStr) continue;
          const tagKey = tagStr.toLowerCase().trim();
          const tagObj = tagMap.get(tagKey) || tagMap.get(tagStr);
          if (tagObj?.id && !resolvedTagIds.includes(tagObj.id)) {
            resolvedTagIds.push(tagObj.id);
          }
        }

        // Resolve Options
        let options = [];
        if (Array.isArray(item.options) && item.options.length > 0) {
          options = item.options.map((opt, idx) => ({
            optionText: (opt.optionText || opt.text || "").trim(),
            isCorrect: Boolean(opt.isCorrect),
            sequence: opt.sequence || idx + 1,
            explanation: opt.explanation || null,
          }));
        } else {
          const letters = ["A", "B", "C", "D"];
          letters.forEach((letter, idx) => {
            const optVal =
              item[`option${letter}`] ||
              item[`Option${letter}`] ||
              item[`option_${letter.toLowerCase()}`] ||
              item[letter];
            if (optVal && String(optVal).trim()) {
              const optText = String(optVal).trim();
              const isCorrect =
                item.correctAnswer === `option${letter}` ||
                item.correctAnswer === letter ||
                String(item.correctAnswer).trim().toLowerCase() === optText.toLowerCase();
              options.push({
                optionText: optText,
                isCorrect,
                sequence: idx + 1,
              });
            }
          });
        }

        // Ensure at least one correct option if options exist
        if (options.length > 0 && !options.some((o) => o.isCorrect)) {
          options[0].isCorrect = true;
        }

        const normalizedDifficulty = (item.difficulty || "MEDIUM").toUpperCase();
        const difficulty = ["EASY", "MEDIUM", "HARD"].includes(normalizedDifficulty)
          ? normalizedDifficulty
          : "MEDIUM";

        const rawType = (item.type || "SINGLE_CHOICE").toUpperCase();
        const type = rawType === "MCQ" ? "SINGLE_CHOICE" : rawType;

        const questionPayload = {
          title: rawTitle,
          content: item.content || item.description || rawTitle,
          description: item.description || rawTitle,
          explanation: item.explanation || null,
          type,
          difficulty,
          status: "DRAFT",
          marks: item.marks ? Number(item.marks) : 1,
          negativeMarks: item.negativeMarks ? Number(item.negativeMarks) : 0,
          estimatedTime: item.estimatedTime ? Number(item.estimatedTime) : 120,
          shuffleOptions: item.shuffleOptions !== undefined ? Boolean(item.shuffleOptions) : true,
          categoryId,
        };

        const questionData = QuestionMapper.toCreateEntity(questionPayload, userId, companyId);
        const optionsData = QuestionMapper.toOptionEntities(options);

        // Fast atomic insert with lean select
        const createdItem = await questionRepository.createLean(
          prisma,
          questionData,
          optionsData,
          resolvedTagIds
        );

        created.push({
          id: createdItem.id,
          title: createdItem.title,
          status: createdItem.status,
          type: createdItem.type,
          difficulty: createdItem.difficulty,
        });

        existingTitleSet.add(normalizedTitle);
      } catch (err) {
        logger.error({ err, title: rawTitle }, "Error importing single question in bulk");
        errors.push({
          index: i,
          title: rawTitle,
          reason: err.message || "Failed to create question.",
        });
      }
    }

    return {
      message: `${created.length} questions imported successfully.`,
      data: {
        total: questionsList.length,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: errors.length,
        created,
        skipped,
        errors,
      },
    };
  }
}

module.exports = new QuestionService();
