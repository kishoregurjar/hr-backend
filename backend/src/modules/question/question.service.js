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

    // Pre-cache existing categories & tags
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

    // Pre-fetch existing question titles for company in 1 batch query
    const titlesToCheck = questionsList
      .map((item) => QuestionMapper.normalizeTitle(item.title || item.question || ""))
      .filter((t) => t && t.length >= 5);

    const existingQuestions = await prisma.question.findMany({
      where: {
        title: { in: titlesToCheck },
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      select: { title: true },
    });

    const existingTitleSet = new Set(
      existingQuestions.map((q) => q.title.toLowerCase().trim())
    );

    for (let i = 0; i < questionsList.length; i++) {
      const item = questionsList[i];
      const rawTitle = item.title || item.question || "";
      const title = QuestionMapper.normalizeTitle(rawTitle);

      if (!title || title.length < 5) {
        errors.push({
          index: i,
          title: rawTitle || `Row #${i + 1}`,
          reason: "Question title must be at least 5 characters.",
        });
        continue;
      }

      // Check duplicate in company bank
      const titleLower = title.toLowerCase().trim();
      let isDuplicate = existingTitleSet.has(titleLower);
      if (!isDuplicate) {
        const existing = await questionRepository.findByTitle(title, companyId);
        if (existing) {
          isDuplicate = true;
          existingTitleSet.add(titleLower);
        }
      }

      if (isDuplicate) {
        skipped.push({
          index: i,
          title: rawTitle,
          reason: "Question with this title already exists in company question bank.",
        });
        continue;
      }

      try {
        // Resolve Category
        let categoryId = item.categoryId;
        if (!categoryId && item.category) {
          const catKey = String(item.category).toLowerCase().trim();
          if (categoryMap.has(catKey)) {
            categoryId = categoryMap.get(catKey).id;
          } else {
            const newCat = await prisma.category.create({
              data: { name: item.category.trim() },
            });
            categoryMap.set(newCat.id, newCat);
            categoryMap.set(newCat.name.toLowerCase().trim(), newCat);
            categoryId = newCat.id;
          }
        } else if (categoryId && !categoryMap.has(categoryId)) {
          const cat = await prisma.category.findUnique({ where: { id: categoryId } });
          if (cat) {
            categoryMap.set(cat.id, cat);
            categoryMap.set(cat.name.toLowerCase().trim(), cat);
          }
        }

        // Default category fallback
        if (!categoryId) {
          let generalCat = categoryMap.get("general") || existingCategories[0];
          if (!generalCat) {
            generalCat = await prisma.category.create({
              data: { name: "General" },
            });
            categoryMap.set(generalCat.id, generalCat);
            categoryMap.set("general", generalCat);
          }
          categoryId = generalCat.id;
        }

        // Resolve Tags
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
          if (tagMap.has(tagKey)) {
            resolvedTagIds.push(tagMap.get(tagKey).id);
          } else if (tagMap.has(tagStr)) {
            resolvedTagIds.push(tagMap.get(tagStr).id);
          } else {
            try {
              const newTag = await prisma.tag.upsert({
                where: { name: tagStr },
                update: {},
                create: { name: tagStr },
              });
              tagMap.set(newTag.id, newTag);
              tagMap.set(newTag.name.toLowerCase().trim(), newTag);
              resolvedTagIds.push(newTag.id);
            } catch (err) {
              // ignore tag conflicts
            }
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

        const createdItem = await runTransaction(async (tx) => {
          const questionData = QuestionMapper.toCreateEntity(questionPayload, userId, companyId);
          const optionsData = QuestionMapper.toOptionEntities(options);
          return questionRepository.create(tx, questionData, optionsData, resolvedTagIds);
        });

        created.push(QuestionDto.toResponse(createdItem));
        existingTitleSet.add(titleLower);
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
