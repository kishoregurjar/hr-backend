const {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../../common/errors");
const { prisma } = require("../../config/prisma");
const { runTransaction } = require("../../common/transaction");
const assessmentRepository = require("./assessment.repository");
const { AssessmentMapper } = require("./assessment.mapper");
const { AssessmentDto } = require("./assessment.dto");
const {
  ASSESSMENT_DEFAULT_SORT,
  ASSESSMENT_STATUS,
  ASSESSMENT_LIMITS,
  isAssessmentTransitionAllowed,
  ASSESSMENT_MESSAGES,
  ASSESSMENT_ERRORS,
  ASSESSMENT_QUESTION_MESSAGES,
  ASSESSMENT_QUESTION_ERRORS,
} = require("./assessment.constants");
const { QUESTION_STATUS } = require("../question/question.constants");

/**
 * ==========================================================
 * Enterprise Assessment Service
 * ==========================================================
 * Main service class handling all business operations for Assessment module.
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */
class AssessmentService {
  /**
   * Internal Helper to execute State-Machine transitions with Database Concurrency Protection
   */
  async executeTransition({ tx, currentStatus, targetStatus, assessmentId, data = {} }) {
    if (!isAssessmentTransitionAllowed(currentStatus, targetStatus)) {
      throw new ConflictError(
        `Assessment cannot transition from ${currentStatus} to ${targetStatus}.`,
        ASSESSMENT_ERRORS.INVALID_STATUS || "ASSESSMENT_INVALID_STATUS"
      );
    }

    const result = await assessmentRepository.transitionStatus(tx, {
      id: assessmentId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      data,
    });

    if (!result) {
      throw new ConflictError(
        "Assessment state changed before the requested operation could be completed.",
        ASSESSMENT_ERRORS.INVALID_STATUS || "ASSESSMENT_INVALID_STATUS"
      );
    }

    return result;
  }

  /**
   * Create New Assessment
   */
  async createAssessment(data, createdById) {
    if (!createdById) {
      throw new UnauthorizedError(
        "Authenticated user is required to create an assessment.",
        ASSESSMENT_ERRORS.OWNERSHIP_REQUIRED || "ASSESSMENT_OWNERSHIP_REQUIRED"
      );
    }

    const normalizedData = {
      ...data,
      title: AssessmentMapper.normalizeTitle(data.title),
    };

    const existingAssessment = await assessmentRepository.findByTitle(
      normalizedData.title,
      { includeDeleted: false }
    );

    if (existingAssessment) {
      throw new ConflictError(
        "An assessment with this title already exists.",
        ASSESSMENT_ERRORS.TITLE_ALREADY_EXISTS || "ASSESSMENT_TITLE_ALREADY_EXISTS"
      );
    }

    const assessmentData = AssessmentMapper.toCreateEntity(
      normalizedData,
      createdById
    );

    const createdAssessment = await runTransaction(async (tx) => {
      return assessmentRepository.create(tx, assessmentData);
    });

    return {
      message: ASSESSMENT_MESSAGES.CREATED,
      data: AssessmentDto.toResponse(createdAssessment),
    };
  }

  /**
   * List Assessments (Paginated, Searchable, Sorted, Filtered & Ownership Scoped)
   */
  async getAssessments(query, user) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const { search, status, type, difficulty, sortBy, sortOrder } = query;

    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (status) where.status = status;
    if (type) where.type = type;
    if (difficulty) where.difficulty = difficulty;

    if (user.role === "HR") {
      where.createdById = user.id;
    }

    const orderBy = {
      [sortBy || ASSESSMENT_DEFAULT_SORT.FIELD]:
        sortOrder || ASSESSMENT_DEFAULT_SORT.ORDER,
    };

    const [assessments, total] = await Promise.all([
      assessmentRepository.list({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      assessmentRepository.count(where),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      message: ASSESSMENT_MESSAGES.LIST_FETCHED,
      data: AssessmentDto.toCollection(assessments),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get Single Assessment By ID with Ownership Authorization
   */
  async getAssessmentById(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    return {
      message: ASSESSMENT_MESSAGES.FETCHED,
      data: AssessmentDto.toResponse(assessment),
    };
  }

  /**
   * Update Draft Assessment Properties
   */
  async updateAssessment(assessmentId, data, user) {
    const existingAssessment = await assessmentRepository.findById(
      assessmentId,
      {
        includeDeleted: false,
        detailed: true,
      }
    );

    if (!existingAssessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && existingAssessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to update this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (existingAssessment.status !== ASSESSMENT_STATUS.DRAFT) {
      throw new BadRequestError(
        "Only draft assessments can be updated.",
        ASSESSMENT_ERRORS.CANNOT_UPDATE || "ASSESSMENT_CANNOT_BE_UPDATED"
      );
    }

    const normalizedData = { ...data };
    if (data.title !== undefined) {
      normalizedData.title = AssessmentMapper.normalizeTitle(data.title);
    }

    if (
      normalizedData.title !== undefined &&
      normalizedData.title.toLowerCase() !== existingAssessment.title.toLowerCase()
    ) {
      const duplicate = await assessmentRepository.findByTitle(
        normalizedData.title,
        { includeDeleted: false }
      );

      if (duplicate && duplicate.id !== assessmentId) {
        throw new ConflictError(
          "An assessment with this title already exists.",
          ASSESSMENT_ERRORS.TITLE_ALREADY_EXISTS || "ASSESSMENT_TITLE_ALREADY_EXISTS"
        );
      }
    }

    const finalAssessment = {
      ...existingAssessment,
      ...normalizedData,
    };

    if (finalAssessment.passingScore > finalAssessment.maximumScore) {
      throw new BadRequestError(
        "Passing score cannot be greater than maximum score.",
        ASSESSMENT_ERRORS.INVALID_PASSING_SCORE || "ASSESSMENT_INVALID_PASSING_SCORE"
      );
    }

    if (
      finalAssessment.startsAt &&
      finalAssessment.endsAt &&
      new Date(finalAssessment.startsAt) >= new Date(finalAssessment.endsAt)
    ) {
      throw new BadRequestError(
        "endsAt must be later than startsAt.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    if (
      finalAssessment.publishAt &&
      finalAssessment.startsAt &&
      new Date(finalAssessment.publishAt) > new Date(finalAssessment.startsAt)
    ) {
      throw new BadRequestError(
        "publishAt cannot be later than startsAt.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    if (finalAssessment.endsAt && !finalAssessment.startsAt) {
      throw new BadRequestError(
        "startsAt is required when endsAt is provided.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    const updateData = AssessmentMapper.toUpdateEntity(normalizedData);

    const updatedAssessment = await runTransaction(async (tx) => {
      return assessmentRepository.update(tx, assessmentId, updateData);
    });

    return {
      message: ASSESSMENT_MESSAGES.UPDATED || "Assessment updated successfully.",
      data: AssessmentDto.toResponse(updatedAssessment),
    };
  }

  /**
   * Soft Delete Assessment
   */
  async deleteAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: false,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to delete this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (
      assessment.status === ASSESSMENT_STATUS.PUBLISHED ||
      assessment.status === ASSESSMENT_STATUS.ACTIVE
    ) {
      throw new BadRequestError(
        "Published or active assessments cannot be deleted.",
        ASSESSMENT_ERRORS.CANNOT_DELETE || "ASSESSMENT_CANNOT_BE_DELETED"
      );
    }

    const deletedAssessment = await runTransaction(async (tx) => {
      return assessmentRepository.softDelete(tx, assessmentId);
    });

    return {
      message: ASSESSMENT_MESSAGES.DELETED || "Assessment deleted successfully.",
      data: {
        id: deletedAssessment.id,
        deletedAt: deletedAssessment.deletedAt,
      },
    };
  }

  /**
   * Restore Soft-Deleted Assessment
   */
  async restoreAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: true,
      detailed: false,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (!assessment.deletedAt) {
      throw new ConflictError(
        "Assessment is already active.",
        ASSESSMENT_ERRORS.ALREADY_ACTIVE || "ASSESSMENT_ALREADY_ACTIVE"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to restore this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    const restoredAssessment = await runTransaction(async (tx) => {
      return assessmentRepository.restore(tx, assessmentId);
    });

    return {
      message: ASSESSMENT_MESSAGES.RESTORED || "Assessment restored successfully.",
      data: AssessmentDto.toResponse(restoredAssessment),
    };
  }

  /**
   * Bulk Assign Questions to Assessment
   */
  async assignQuestions(assessmentId, data, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_QUESTION_ERRORS.ASSESSMENT_NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to modify this assessment.",
        ASSESSMENT_QUESTION_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.DRAFT) {
      throw new BadRequestError(
        "Questions can only be assigned to draft assessments.",
        ASSESSMENT_QUESTION_ERRORS.ASSESSMENT_NOT_EDITABLE || "ASSESSMENT_NOT_EDITABLE"
      );
    }

    const questionIds = data.questions.map((item) => item.questionId);

    const uniqueQuestionIds = new Set(questionIds);
    if (uniqueQuestionIds.size !== questionIds.length) {
      throw new ConflictError(
        "The same question cannot be assigned more than once in the same request.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_QUESTION || "ASSESSMENT_QUESTION_DUPLICATE"
      );
    }

    const sequences = data.questions.map((item) => item.sequence);
    const uniqueSequences = new Set(sequences);
    if (uniqueSequences.size !== sequences.length) {
      throw new ConflictError(
        "Question sequence values must be unique within the request.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_SEQUENCE || "ASSESSMENT_QUESTION_DUPLICATE_SEQUENCE"
      );
    }

    const existingAssignments = assessment.questions ?? [];
    const existingQuestionIds = new Set(existingAssignments.map((item) => item.questionId));
    const alreadyAssigned = questionIds.filter((id) => existingQuestionIds.has(id));
    if (alreadyAssigned.length > 0) {
      throw new ConflictError(
        "One or more questions are already assigned to this assessment.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_QUESTION || "ASSESSMENT_QUESTION_DUPLICATE"
      );
    }

    const existingSequences = new Set(existingAssignments.map((item) => item.sequence));
    const conflictingSequences = sequences.filter((seq) => existingSequences.has(seq));
    if (conflictingSequences.length > 0) {
      throw new ConflictError(
        "One or more question sequence values are already in use.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_SEQUENCE || "ASSESSMENT_QUESTION_DUPLICATE_SEQUENCE"
      );
    }

    const questions = await prisma.question.findMany({
      where: {
        id: {
          in: questionIds,
        },
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        status: true,
        isActive: true,
      },
    });

    if (questions.length !== questionIds.length) {
      throw new NotFoundError(
        "One or more questions were not found.",
        ASSESSMENT_QUESTION_ERRORS.QUESTIONS_NOT_FOUND || "ASSESSMENT_QUESTIONS_NOT_FOUND"
      );
    }

    const unpublishedQuestions = questions.filter(
      (question) => question.status !== QUESTION_STATUS.PUBLISHED
    );
    if (unpublishedQuestions.length > 0) {
      throw new BadRequestError(
        "Only published questions can be assigned to an assessment.",
        ASSESSMENT_QUESTION_ERRORS.QUESTION_NOT_PUBLISHED || "ASSESSMENT_QUESTION_NOT_PUBLISHED"
      );
    }

    const inactiveQuestions = questions.filter((question) => !question.isActive);
    if (inactiveQuestions.length > 0) {
      throw new BadRequestError(
        "Inactive questions cannot be assigned.",
        ASSESSMENT_QUESTION_ERRORS.QUESTION_INACTIVE || "ASSESSMENT_QUESTION_INACTIVE"
      );
    }

    const existingMarks = existingAssignments.reduce(
      (total, item) => total + (item.marks || 0),
      0
    );
    const incomingMarks = data.questions.reduce(
      (total, item) => total + (item.marks || 0),
      0
    );
    const finalMarks = existingMarks + incomingMarks;

    if (finalMarks > assessment.maximumScore) {
      throw new BadRequestError(
        `Total question marks (${finalMarks}) cannot exceed assessment maximum score (${assessment.maximumScore}).`,
        ASSESSMENT_QUESTION_ERRORS.MAXIMUM_SCORE_EXCEEDED || "ASSESSMENT_MAXIMUM_SCORE_EXCEEDED"
      );
    }

    const assignmentData = data.questions.map((question) => ({
      questionId: question.questionId,
      sequence: question.sequence,
      marks: question.marks,
      negativeMarks: question.negativeMarks,
    }));

    const result = await runTransaction(async (tx) => {
      await assessmentRepository.addQuestions(tx, assessmentId, assignmentData);
      return assessmentRepository.findById(assessmentId, { includeDeleted: false, detailed: true }, tx);
    });

    return {
      message: ASSESSMENT_QUESTION_MESSAGES.ASSIGNED || "Questions assigned to assessment successfully.",
      data: AssessmentDto.toResponse(result),
    };
  }

  /**
   * Reorder Assessment Questions
   */
  async reorderQuestions(assessmentId, data, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_QUESTION_ERRORS.ASSESSMENT_NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to modify this assessment.",
        ASSESSMENT_QUESTION_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.DRAFT) {
      throw new BadRequestError(
        "Questions can only be reordered while the assessment is in draft status.",
        ASSESSMENT_QUESTION_ERRORS.ASSESSMENT_NOT_EDITABLE || "ASSESSMENT_NOT_EDITABLE"
      );
    }

    const requestedQuestions = data.questions;
    const requestedQuestionIds = requestedQuestions.map((item) => item.questionId);
    const requestedSequences = requestedQuestions.map((item) => item.sequence);

    const uniqueQuestionIds = new Set(requestedQuestionIds);
    if (uniqueQuestionIds.size !== requestedQuestionIds.length) {
      throw new BadRequestError(
        "The same question cannot appear more than once in the reorder request.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_QUESTION || "ASSESSMENT_QUESTION_DUPLICATE"
      );
    }

    const uniqueSequences = new Set(requestedSequences);
    if (uniqueSequences.size !== requestedSequences.length) {
      throw new BadRequestError(
        "Question sequence values must be unique.",
        ASSESSMENT_QUESTION_ERRORS.DUPLICATE_SEQUENCE || "ASSESSMENT_QUESTION_DUPLICATE_SEQUENCE"
      );
    }

    const existingAssignments = await assessmentRepository.findAssessmentQuestions(assessmentId);

    if (existingAssignments.length === 0) {
      throw new BadRequestError(
        "Assessment has no questions to reorder.",
        ASSESSMENT_QUESTION_ERRORS.INVALID_REORDER || "ASSESSMENT_QUESTION_INVALID_REORDER"
      );
    }

    const existingQuestionIds = new Set(existingAssignments.map((item) => item.questionId));

    if (existingQuestionIds.size !== requestedQuestionIds.length) {
      throw new BadRequestError(
        "Reorder payload must contain all assigned questions.",
        ASSESSMENT_QUESTION_ERRORS.INVALID_REORDER || "ASSESSMENT_QUESTION_INVALID_REORDER"
      );
    }

    for (const qId of requestedQuestionIds) {
      if (!existingQuestionIds.has(qId)) {
        throw new BadRequestError(
          "Reorder payload contains a question that is not assigned to this assessment.",
          ASSESSMENT_QUESTION_ERRORS.INVALID_REORDER || "ASSESSMENT_QUESTION_INVALID_REORDER"
        );
      }
    }

    const sortedSequences = [...requestedSequences].sort((a, b) => a - b);
    for (let index = 0; index < sortedSequences.length; index += 1) {
      const expectedSequence = index + 1;
      if (sortedSequences[index] !== expectedSequence) {
        throw new BadRequestError(
          "Question sequences must be continuous starting from 1.",
          ASSESSMENT_QUESTION_ERRORS.INVALID_SEQUENCE || "ASSESSMENT_QUESTION_INVALID_SEQUENCE"
        );
      }
    }

    const currentMaxSequence = existingAssignments.reduce(
      (max, item) => Math.max(max, item.sequence),
      0
    );
    const temporaryOffset = currentMaxSequence + requestedQuestions.length + 1000;

    const reorderedAssessment = await runTransaction(async (tx) => {
      await assessmentRepository.moveSequencesToTemporarySpace(
        tx,
        assessmentId,
        temporaryOffset
      );

      for (const item of requestedQuestions) {
        await assessmentRepository.updateQuestionSequence(
          tx,
          assessmentId,
          item.questionId,
          item.sequence
        );
      }

      return assessmentRepository.findById(
        assessmentId,
        { includeDeleted: false, detailed: true },
        tx
      );
    });

    return {
      message: ASSESSMENT_QUESTION_MESSAGES.REORDERED || "Assessment questions reordered successfully.",
      data: AssessmentDto.toResponse(reorderedAssessment),
    };
  }

  /**
   * Publish Assessment
   */
  async publishAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to publish this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.DRAFT) {
      throw new ConflictError(
        "Only draft assessments can be published.",
        ASSESSMENT_ERRORS.INVALID_STATUS || "ASSESSMENT_INVALID_STATUS"
      );
    }

    const assessmentQuestions = assessment.questions ?? [];
    if (assessmentQuestions.length === 0) {
      throw new BadRequestError(
        "At least one question is required before publishing the assessment.",
        ASSESSMENT_ERRORS.NO_QUESTIONS || "ASSESSMENT_NO_QUESTIONS"
      );
    }

    for (const item of assessmentQuestions) {
      const question = item.question;
      if (!question) {
        throw new BadRequestError(
          "One or more assigned questions are invalid.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.status !== QUESTION_STATUS.PUBLISHED) {
        throw new BadRequestError(
          "All assigned questions must be published before assessment can be published.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.isActive === false) {
        throw new BadRequestError(
          "All assigned questions must be active.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.deletedAt !== null && question.deletedAt !== undefined) {
        throw new BadRequestError(
          "Deleted questions cannot be part of a published assessment.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }
    }

    const sequences = assessmentQuestions
      .map((item) => item.sequence)
      .sort((a, b) => a - b);

    for (let index = 0; index < sequences.length; index += 1) {
      if (sequences[index] !== index + 1) {
        throw new BadRequestError(
          "Assessment question sequences must start from 1 and be continuous.",
          ASSESSMENT_ERRORS.INVALID_QUESTION_SEQUENCE || "ASSESSMENT_INVALID_QUESTION_SEQUENCE"
        );
      }
    }

    const totalQuestionMarks = assessmentQuestions.reduce(
      (total, item) => total + (item.marks || 0),
      0
    );

    if (totalQuestionMarks <= 0) {
      throw new BadRequestError(
        "Assessment must have valid question marks before publishing.",
        ASSESSMENT_ERRORS.INVALID_TOTAL_MARKS || "ASSESSMENT_INVALID_TOTAL_MARKS"
      );
    }

    if (totalQuestionMarks > assessment.maximumScore) {
      throw new BadRequestError(
        `Total question marks (${totalQuestionMarks}) cannot exceed assessment maximum score (${assessment.maximumScore}).`,
        ASSESSMENT_ERRORS.INVALID_TOTAL_MARKS || "ASSESSMENT_INVALID_TOTAL_MARKS"
      );
    }

    if (assessment.passingScore > totalQuestionMarks) {
      throw new BadRequestError(
        `Passing score (${assessment.passingScore}) cannot be greater than the total available question marks (${totalQuestionMarks}).`,
        ASSESSMENT_ERRORS.INVALID_PASSING_SCORE || "ASSESSMENT_INVALID_PASSING_SCORE"
      );
    }

    if (
      assessment.startsAt &&
      assessment.endsAt &&
      new Date(assessment.startsAt) >= new Date(assessment.endsAt)
    ) {
      throw new BadRequestError(
        "endsAt must be later than startsAt.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    if (
      assessment.publishAt &&
      assessment.startsAt &&
      new Date(assessment.publishAt) > new Date(assessment.startsAt)
    ) {
      throw new BadRequestError(
        "publishAt cannot be later than startsAt.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    if (assessment.endsAt && !assessment.startsAt) {
      throw new BadRequestError(
        "startsAt is required when endsAt is provided.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    const publishedAssessment = await runTransaction(async (tx) => {
      return this.executeTransition({
        tx,
        assessmentId,
        currentStatus: ASSESSMENT_STATUS.DRAFT,
        targetStatus: ASSESSMENT_STATUS.PUBLISHED,
        data: { publishAt: new Date() },
      });
    });

    const detailedAssessment = await assessmentRepository.findById(
      publishedAssessment.id,
      { includeDeleted: false, detailed: true }
    );

    return {
      message: ASSESSMENT_MESSAGES.PUBLISHED || "Assessment published successfully.",
      data: AssessmentDto.toResponse(detailedAssessment),
    };
  }

  /**
   * Unpublish Assessment (PUBLISHED -> DRAFT)
   */
  async unpublishAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: false,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to unpublish this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.PUBLISHED) {
      throw new ConflictError(
        "Only published assessments can be unpublished.",
        ASSESSMENT_ERRORS.UNPUBLISH_NOT_ALLOWED || "ASSESSMENT_UNPUBLISH_NOT_ALLOWED"
      );
    }

    const unpublishedAssessment = await runTransaction(async (tx) => {
      return this.executeTransition({
        tx,
        assessmentId,
        currentStatus: ASSESSMENT_STATUS.PUBLISHED,
        targetStatus: ASSESSMENT_STATUS.DRAFT,
        data: { publishAt: null },
      });
    });

    const detailedAssessment = await assessmentRepository.findById(
      unpublishedAssessment.id,
      { includeDeleted: false, detailed: true }
    );

    return {
      message: ASSESSMENT_MESSAGES.UNPUBLISHED || "Assessment unpublished successfully.",
      data: AssessmentDto.toResponse(detailedAssessment),
    };
  }

  /**
   * Activate Assessment (PUBLISHED -> ACTIVE)
   */
  async activateAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to activate this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status === ASSESSMENT_STATUS.ACTIVE) {
      throw new ConflictError(
        "Assessment is already active.",
        ASSESSMENT_ERRORS.ALREADY_ACTIVE || "ASSESSMENT_ALREADY_ACTIVE"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.PUBLISHED) {
      throw new ConflictError(
        "Only published assessments can be activated.",
        ASSESSMENT_ERRORS.CANNOT_ACTIVATE || "ASSESSMENT_CANNOT_BE_ACTIVATED"
      );
    }

    if (!assessment.publishAt) {
      throw new BadRequestError(
        "Assessment must have a valid publish timestamp before activation.",
        ASSESSMENT_ERRORS.CANNOT_ACTIVATE || "ASSESSMENT_CANNOT_BE_ACTIVATED"
      );
    }

    const assessmentQuestions = assessment.questions ?? [];
    if (assessmentQuestions.length === 0) {
      throw new BadRequestError(
        "Assessment must contain at least one question before activation.",
        ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
      );
    }

    for (const item of assessmentQuestions) {
      const question = item.question;
      if (!question) {
        throw new BadRequestError(
          "One or more assigned questions are invalid.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.status !== QUESTION_STATUS.PUBLISHED) {
        throw new BadRequestError(
          "All assigned questions must remain published.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.isActive === false) {
        throw new BadRequestError(
          "All assigned questions must remain active.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }

      if (question.deletedAt !== null && question.deletedAt !== undefined) {
        throw new BadRequestError(
          "Deleted questions cannot be used by an active assessment.",
          ASSESSMENT_ERRORS.INVALID_QUESTIONS || "ASSESSMENT_INVALID_QUESTIONS"
        );
      }
    }

    const sequences = assessmentQuestions
      .map((item) => item.sequence)
      .sort((a, b) => a - b);

    for (let index = 0; index < sequences.length; index += 1) {
      if (sequences[index] !== index + 1) {
        throw new BadRequestError(
          "Assessment question sequences must start from 1 and be continuous.",
          ASSESSMENT_ERRORS.INVALID_QUESTION_SEQUENCE || "ASSESSMENT_INVALID_QUESTION_SEQUENCE"
        );
      }
    }

    const totalQuestionMarks = assessmentQuestions.reduce(
      (total, item) => total + (item.marks || 0),
      0
    );

    if (totalQuestionMarks <= 0) {
      throw new BadRequestError(
        "Assessment must have valid question marks.",
        ASSESSMENT_ERRORS.INVALID_TOTAL_MARKS || "ASSESSMENT_INVALID_TOTAL_MARKS"
      );
    }

    if (totalQuestionMarks > assessment.maximumScore) {
      throw new BadRequestError(
        `Total question marks (${totalQuestionMarks}) cannot exceed assessment maximum score (${assessment.maximumScore}).`,
        ASSESSMENT_ERRORS.INVALID_TOTAL_MARKS || "ASSESSMENT_INVALID_TOTAL_MARKS"
      );
    }

    if (assessment.passingScore > totalQuestionMarks) {
      throw new BadRequestError(
        `Passing score (${assessment.passingScore}) cannot exceed total available question marks (${totalQuestionMarks}).`,
        ASSESSMENT_ERRORS.INVALID_PASSING_SCORE || "ASSESSMENT_INVALID_PASSING_SCORE"
      );
    }

    const now = new Date();
    if (
      assessment.startsAt &&
      assessment.endsAt &&
      new Date(assessment.startsAt) >= new Date(assessment.endsAt)
    ) {
      throw new BadRequestError(
        "endsAt must be later than startsAt.",
        ASSESSMENT_ERRORS.INVALID_DATE_RANGE || "ASSESSMENT_INVALID_DATE_RANGE"
      );
    }

    if (assessment.endsAt && new Date(assessment.endsAt) <= now) {
      throw new BadRequestError(
        "Assessment end time has already passed.",
        ASSESSMENT_ERRORS.ALREADY_EXPIRED || "ASSESSMENT_ALREADY_EXPIRED"
      );
    }

    const activatedAssessment = await runTransaction(async (tx) => {
      return this.executeTransition({
        tx,
        assessmentId,
        currentStatus: ASSESSMENT_STATUS.PUBLISHED,
        targetStatus: ASSESSMENT_STATUS.ACTIVE,
        data: {},
      });
    });

    const detailedAssessment = await assessmentRepository.findById(
      activatedAssessment.id,
      { includeDeleted: false, detailed: true }
    );

    return {
      message: ASSESSMENT_MESSAGES.ACTIVATED || "Assessment activated successfully.",
      data: AssessmentDto.toResponse(detailedAssessment),
    };
  }

  /**
   * Archive Assessment (ACTIVE -> ARCHIVED)
   */
  async archiveAssessment(assessmentId, user) {
    const assessment = await assessmentRepository.findById(assessmentId, {
      includeDeleted: false,
      detailed: true,
    });

    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && assessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to archive this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (assessment.status === ASSESSMENT_STATUS.ARCHIVED) {
      throw new ConflictError(
        "Assessment is already archived.",
        ASSESSMENT_ERRORS.ALREADY_ARCHIVED || "ASSESSMENT_ALREADY_ARCHIVED"
      );
    }

    if (assessment.status !== ASSESSMENT_STATUS.ACTIVE) {
      throw new ConflictError(
        "Only active assessments can be archived.",
        ASSESSMENT_ERRORS.CANNOT_ARCHIVE || "ASSESSMENT_CANNOT_BE_ARCHIVED"
      );
    }

    const archivedAssessment = await runTransaction(async (tx) => {
      return this.executeTransition({
        tx,
        assessmentId,
        currentStatus: ASSESSMENT_STATUS.ACTIVE,
        targetStatus: ASSESSMENT_STATUS.ARCHIVED,
        data: {},
      });
    });

    const detailedAssessment = await assessmentRepository.findById(
      archivedAssessment.id,
      { includeDeleted: false, detailed: true }
    );

    return {
      message: ASSESSMENT_MESSAGES.ARCHIVED || "Assessment archived successfully.",
      data: AssessmentDto.toResponse(detailedAssessment),
    };
  }

  /**
   * Duplicate Assessment
   */
  async duplicateAssessment(assessmentId, data, user) {
    const sourceAssessment = await assessmentRepository.findById(
      assessmentId,
      {
        includeDeleted: false,
        detailed: true,
      }
    );

    if (!sourceAssessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    if (user.role === "HR" && sourceAssessment.createdById !== user.id) {
      throw new ForbiddenError(
        "You do not have access to duplicate this assessment.",
        ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
      );
    }

    if (sourceAssessment.deletedAt) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    const sourceTitle = sourceAssessment.title.trim();
    const requestedTitle = data?.title?.trim();
    const duplicateTitle = requestedTitle || `${sourceTitle} - Copy`;

    if (duplicateTitle.length < ASSESSMENT_LIMITS.TITLE_MIN_LENGTH) {
      throw new BadRequestError(
        "Duplicate assessment title is invalid.",
        ASSESSMENT_ERRORS.DUPLICATE_FAILED || "ASSESSMENT_DUPLICATE_FAILED"
      );
    }

    if (duplicateTitle.length > ASSESSMENT_LIMITS.TITLE_MAX_LENGTH) {
      throw new BadRequestError(
        "Duplicate assessment title is too long.",
        ASSESSMENT_ERRORS.DUPLICATE_FAILED || "ASSESSMENT_DUPLICATE_FAILED"
      );
    }

    const existingAssessment = await assessmentRepository.findByTitle(
      duplicateTitle,
      { includeDeleted: false }
    );

    if (existingAssessment) {
      throw new ConflictError(
        "An assessment with this title already exists.",
        ASSESSMENT_ERRORS.TITLE_ALREADY_EXISTS || "ASSESSMENT_TITLE_ALREADY_EXISTS"
      );
    }

    const duplicatedAssessment = await runTransaction(async (tx) => {
      const titleExists = await assessmentRepository.findByTitle(
        duplicateTitle,
        { includeDeleted: false },
        tx
      );

      if (titleExists) {
        throw new ConflictError(
          "An assessment with this title already exists.",
          ASSESSMENT_ERRORS.TITLE_ALREADY_EXISTS || "ASSESSMENT_TITLE_ALREADY_EXISTS"
        );
      }

      return assessmentRepository.duplicate(tx, sourceAssessment, {
        title: duplicateTitle,
        createdById: user.id,
      });
    });

    return {
      message: ASSESSMENT_MESSAGES.DUPLICATED || "Assessment duplicated successfully.",
      data: AssessmentDto.toResponse(duplicatedAssessment),
    };
  }
}

module.exports = new AssessmentService();
