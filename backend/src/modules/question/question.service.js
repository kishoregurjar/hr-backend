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
  async createQuestion(payload, userId) {
    const title = QuestionMapper.normalizeTitle(payload.title);
    logger.info({ userId, title }, "Initiating question creation");

    const existingQuestion = await questionRepository.findByTitle(title);
    if (existingQuestion) {
      throw new ConflictError("Question with this title already exists.", "QUESTION_TITLE_EXISTS");
    }

    const createdQuestion = await runTransaction(async (tx) => {
      const questionData = QuestionMapper.toCreateEntity(payload, userId);
      const optionsData = QuestionMapper.toOptionEntities(payload.options);
      const tagIds = payload.tagIds || [];

      return questionRepository.create(tx, questionData, optionsData, tagIds);
    });

    return {
      message: "Question created successfully.",
      data: QuestionDto.toResponse(createdQuestion),
    };
  }

  async getQuestions(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
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

  async updateQuestion(id, payload, userId) {
    const question = await questionRepository.findById(id);
    if (!question) {
      throw new NotFoundError("Question not found.", "QUESTION_NOT_FOUND");
    }

    if (payload.title) {
      const title = QuestionMapper.normalizeTitle(payload.title);
      const existing = await questionRepository.findByTitle(title);
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
}

module.exports = new QuestionService();
