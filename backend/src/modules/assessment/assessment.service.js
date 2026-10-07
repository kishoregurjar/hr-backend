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
const { getCanonicalGameCode } = require("../game/game.constants");

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
   * Enrich assessment games with company owner's configured difficulty level
   */
  async _enrichWithCompanyGameConfig(assessment, explicitCompanyId = null) {
    if (!assessment || !Array.isArray(assessment.games) || !prisma.companyGameConfig) {
      return assessment;
    }

    try {
      let companyId = explicitCompanyId;

      if (!companyId) {
        const savedCompanyId = assessment.games.find(g => g.config?.companyId)?.config?.companyId;
        if (savedCompanyId) companyId = savedCompanyId;
      }

      if (!companyId && assessment.createdById) {
        const member = await prisma.companyMember.findFirst({
          where: { userId: assessment.createdById },
          select: { companyId: true },
        });
        companyId = member?.companyId || null;
      }

      let configs = [];
      if (companyId) {
        configs = await prisma.companyGameConfig.findMany({
          where: { companyId },
          include: { game: true },
        });
      }

      const configMap = new Map();
      configs.forEach((c) => {
        if (c.gameId) configMap.set(String(c.gameId).toLowerCase(), c);
        if (c.game?.code) {
          const codeStr = String(c.game.code).toLowerCase();
          configMap.set(codeStr, c);
          configMap.set(codeStr.replace(/_/g, "-"), c);
          configMap.set(codeStr.replace(/-/g, "_"), c);
        }
        if (c.game?.slug) {
          const slugStr = String(c.game.slug).toLowerCase();
          configMap.set(slugStr, c);
          configMap.set(slugStr.replace(/_/g, "-"), c);
          configMap.set(slugStr.replace(/-/g, "_"), c);
        }
        if (c.game?.id) configMap.set(String(c.game.id).toLowerCase(), c);
        const canon = getCanonicalGameCode(c.game?.code || c.game?.slug || c.gameId);
        if (canon) configMap.set(canon.toLowerCase(), c);
      });

      assessment.games = assessment.games.map((ag) => {
        const gameIdKey = String(ag.gameId || ag.game?.id || "").toLowerCase();
        const gameCodeKey = String(ag.game?.code || "").toLowerCase();
        const canonKey = getCanonicalGameCode(ag.game?.code || ag.gameId || ag.game?.name)?.toLowerCase();

        const conf =
          configMap.get(gameIdKey) ||
          configMap.get(gameCodeKey) ||
          (canonKey ? configMap.get(canonKey) : null) ||
          configMap.get(gameCodeKey.replace(/_/g, "-")) ||
          configMap.get(gameCodeKey.replace(/-/g, "_"));

        const assessmentConfigDifficulty = ag.config?.difficulty;
        const effectiveDiff = assessmentConfigDifficulty || conf?.difficulty;

        if (effectiveDiff) {
          const diffFormatted =
            effectiveDiff.charAt(0).toUpperCase() +
            effectiveDiff.slice(1).toLowerCase();

          return {
            ...ag,
            difficulty: diffFormatted,
            duration: conf?.duration || ag.config?.duration || ag.duration || 10,
            passingScore: conf?.passingScore || ag.config?.passingScore || ag.passingScore || 70,
            config: {
              ...(ag.config || {}),
              difficulty: effectiveDiff.toLowerCase(),
              duration: conf?.duration || ag.config?.duration || ag.duration || 10,
              passingScore: conf?.passingScore || ag.config?.passingScore || ag.passingScore || 70,
              companyId: conf?.companyId || ag.config?.companyId || companyId || undefined,
            },
            game: ag.game
              ? {
                  ...ag.game,
                  difficulty: diffFormatted,
                  duration: conf?.duration || ag.config?.duration || ag.duration || 10,
                  passingScore: conf?.passingScore || ag.config?.passingScore || ag.passingScore || 70,
                  config: {
                    ...(ag.game.config || {}),
                    difficulty: effectiveDiff.toLowerCase(),
                  },
                }
              : null,
          };
        }
        return ag;
      });
    } catch (_err) {
      // safe fallback
    }

    return assessment;
  }

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

  async _buildGameIdsWithConfig(gameIds, companyId, existingAssessmentGames = []) {
    if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) return [];

    let configMap = new Map();
    if (companyId) {
      const configs = await prisma.companyGameConfig.findMany({
        where: { companyId },
        include: { game: true },
      });
      configs.forEach((c) => {
        if (c.gameId) configMap.set(String(c.gameId).toLowerCase(), c);
        if (c.game?.code) {
          const codeStr = String(c.game.code).toLowerCase();
          configMap.set(codeStr, c);
          configMap.set(codeStr.replace(/_/g, "-"), c);
          configMap.set(codeStr.replace(/-/g, "_"), c);
        }
        if (c.game?.slug) {
          const slugStr = String(c.game.slug).toLowerCase();
          configMap.set(slugStr, c);
          configMap.set(slugStr.replace(/_/g, "-"), c);
          configMap.set(slugStr.replace(/-/g, "_"), c);
        }
        const canon = getCanonicalGameCode(c.game?.code || c.game?.slug || c.gameId);
        if (canon) configMap.set(canon.toLowerCase(), c);
      });
    }

    const existingMap = new Map();
    existingAssessmentGames.forEach(ag => {
      const gId = String(ag.gameId || ag.game?.id || "").toLowerCase();
      if (gId) existingMap.set(gId, ag.config);
      const canon = getCanonicalGameCode(ag.gameId || ag.game?.code);
      if (canon) existingMap.set(canon.toLowerCase(), ag.config);
    });

    return gameIds.map(g => {
      const rawId = typeof g === "object" ? String(g.gameId || g.id || g.slug || g.code || "").toLowerCase() : String(g).toLowerCase();
      const canonRaw = getCanonicalGameCode(rawId);
      
      const companyConf =
        configMap.get(rawId) ||
        (canonRaw ? configMap.get(canonRaw.toLowerCase()) : null) ||
        configMap.get(rawId.replace(/_/g, "-")) ||
        configMap.get(rawId.replace(/-/g, "_"));
      
      let baseConfig = typeof g === "object" ? (g.config || null) : null;
      if (!baseConfig) {
        if (existingMap.has(rawId)) {
          baseConfig = existingMap.get(rawId);
        } else if (canonRaw && existingMap.has(canonRaw.toLowerCase())) {
          baseConfig = existingMap.get(canonRaw.toLowerCase());
        }
      }

      let finalConfig = baseConfig ? { ...baseConfig } : {};
      if (companyConf) {
        const { id, companyId: cId, gameId, createdAt, updatedAt, game, ...restConf } = companyConf;
        finalConfig = { ...restConf, ...finalConfig, companyId: finalConfig.companyId || cId };
      } else if (companyId) {
        finalConfig = { ...finalConfig, companyId: finalConfig.companyId || companyId };
      }

      return { id: typeof g === "object" ? (g.gameId || g.id) : g, config: Object.keys(finalConfig).length > 0 ? finalConfig : null };
    });
  }

  /**
   * Create New Assessment
   */
  async createAssessment(data, createdById, explicitCompanyId = null) {
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

    let companyId = explicitCompanyId;
    if (!companyId) {
      const userCompanyMember = await prisma.companyMember.findFirst({
        where: { userId: createdById },
        select: { companyId: true },
      });
      companyId = userCompanyMember?.companyId;
    }

    const existingAssessment = await assessmentRepository.findByTitle(
      normalizedData.title,
      { includeDeleted: false, companyId }
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

    const rawGameIds = data.selectedGameIds || data.gameIds || data.games || [];
    const gameIds = await this._buildGameIdsWithConfig(rawGameIds, companyId);
    const rawQuestions = data.selectedQuestionIds || data.questionIds || data.questions || [];

    const createdAssessment = await runTransaction(async (tx) => {
      const created = await assessmentRepository.create(tx, assessmentData);
      if (Array.isArray(gameIds) && gameIds.length > 0) {
        await assessmentRepository.syncGames(tx, created.id, gameIds);
      }
      if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
        const questionPayload = rawQuestions.map((q, idx) => ({
          questionId: typeof q === "object" ? q.questionId || q.id : q,
          sequence: idx,
          marks: typeof q === "object" ? q.points || q.marks || 1 : 1,
        }));
        await assessmentRepository.addQuestions(tx, created.id, questionPayload);
      }
      return assessmentRepository.findById(created.id, { detailed: true }, tx);
    });

    const enrichedAssessment = await this._enrichWithCompanyGameConfig(createdAssessment, companyId);

    return {
      message: ASSESSMENT_MESSAGES.CREATED,
      data: AssessmentDto.toResponse(enrichedAssessment),
    };
  }

  async isUserInSameCompany(userId, targetUserId) {
    if (!userId || !targetUserId) return false;
    if (userId === targetUserId) return true;

    const members = await prisma.companyMember.findMany({
      where: { userId: { in: [userId, targetUserId] } },
      select: { userId: true, companyId: true },
    });

    const userCompany = members.find((m) => m.userId === userId)?.companyId;
    const targetCompany = members.find((m) => m.userId === targetUserId)?.companyId;

    return Boolean(userCompany && targetCompany && userCompany === targetCompany);
  }

  /**
   * List Assessments (Paginated, Searchable, Sorted, Filtered & Company Scoped)
   */
  async getAssessments(query = {}, user = {}) {
    let companyId;
    let createdById = query.createdById;

    if (user?.id) {
      const userMember = await prisma.companyMember.findFirst({
        where: { userId: user.id },
        select: { companyId: true },
      });
      companyId = userMember?.companyId;
    }

    const result = await assessmentRepository.listPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      type: query.type,
      difficulty: query.difficulty,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      companyId,
      createdById: companyId ? undefined : createdById,
    });

    return {
      message: ASSESSMENT_MESSAGES.LIST_FETCHED || "Assessments fetched successfully.",
      data: AssessmentDto.toCollection(result.items),
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPreviousPage: result.page > 1,
      },
    };
  }

  /**
   * Get Single Assessment By ID with Ownership Authorization
   */
  async getAssessmentById(assessmentId, user, explicitCompanyId = null) {
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
    }

    const enrichedAssessment = await this._enrichWithCompanyGameConfig(assessment, explicitCompanyId);

    return {
      message: ASSESSMENT_MESSAGES.FETCHED,
      data: AssessmentDto.toResponse(enrichedAssessment),
    };
  }

  /**
   * Update Draft Assessment Properties
   */
  async updateAssessment(assessmentId, data, user, explicitCompanyId = null) {
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, existingAssessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to update this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
    }

    if (existingAssessment.status === ASSESSMENT_STATUS.ARCHIVED) {
      throw new BadRequestError(
        "Archived assessments cannot be updated.",
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
      const userCompanyMember = await prisma.companyMember.findFirst({
        where: { userId: existingAssessment.createdById },
        select: { companyId: true },
      });
      const companyId = userCompanyMember?.companyId;

      const duplicate = await assessmentRepository.findByTitle(
        normalizedData.title,
        { includeDeleted: false, companyId }
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
    const rawGameIds = data.selectedGameIds ?? data.gameIds ?? data.games;
    let companyId = explicitCompanyId;
    if (!companyId) {
      const userCompanyMember = await prisma.companyMember.findFirst({
        where: { userId: existingAssessment.createdById },
        select: { companyId: true },
      });
      companyId = userCompanyMember?.companyId;
    }
    if (!companyId) {
      const savedCompanyId = existingAssessment.games?.find(g => g.config?.companyId)?.config?.companyId;
      if (savedCompanyId) companyId = savedCompanyId;
    }

    let gameIds = rawGameIds;
    if (rawGameIds !== undefined && Array.isArray(rawGameIds)) {
       gameIds = await this._buildGameIdsWithConfig(
          rawGameIds,
          companyId,
          existingAssessment.games || existingAssessment.assessmentGames || []
       );
    }
    const rawQuestions = data.selectedQuestionIds ?? data.questionIds ?? data.questions;

    const updatedAssessment = await runTransaction(async (tx) => {
      await assessmentRepository.update(tx, assessmentId, updateData);

      if (gameIds !== undefined && Array.isArray(gameIds)) {
        await assessmentRepository.syncGames(tx, assessmentId, gameIds);
      }

      if (rawQuestions !== undefined && Array.isArray(rawQuestions)) {
        await assessmentRepository.clearQuestions(tx, assessmentId);
        if (rawQuestions.length > 0) {
          const questionPayload = rawQuestions.map((q, idx) => ({
            questionId: typeof q === "object" ? q.questionId || q.id : q,
            sequence: idx,
            marks: typeof q === "object" ? q.points || q.marks || 1 : 1,
          }));
          await assessmentRepository.addQuestions(tx, assessmentId, questionPayload);
        }
      }

      return assessmentRepository.findById(assessmentId, { detailed: true }, tx);
    });

    const enrichedAssessment = await this._enrichWithCompanyGameConfig(updatedAssessment, companyId);

    return {
      message: ASSESSMENT_MESSAGES.UPDATED || "Assessment updated successfully.",
      data: AssessmentDto.toResponse(enrichedAssessment),
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to delete this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to restore this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to modify this assessment.",
          ASSESSMENT_QUESTION_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
    }

    if (assessment.status === ASSESSMENT_STATUS.ARCHIVED) {
      throw new BadRequestError(
        "Questions cannot be assigned to archived assessments.",
        ASSESSMENT_QUESTION_ERRORS.ASSESSMENT_NOT_EDITABLE || "ASSESSMENT_NOT_EDITABLE"
      );
    }

    const existingAssignments = assessment.questions ?? [];
    const existingQuestionIds = new Set(existingAssignments.map((item) => item.questionId));

    // Filter out questions that are already assigned to this assessment (Idempotent handling)
    const newQuestionsToAssign = data.questions.filter(
      (item) => !existingQuestionIds.has(item.questionId)
    );

    // If all requested questions are already assigned, return success gracefully
    if (newQuestionsToAssign.length === 0) {
      return {
        message: ASSESSMENT_QUESTION_MESSAGES.ASSIGNED || "Assessment questions assigned successfully.",
        data: AssessmentDto.toResponse(assessment),
      };
    }

    const questionIds = newQuestionsToAssign.map((item) => item.questionId);
    const sequences = newQuestionsToAssign.map((item) => item.sequence);

    const questions = await prisma.question.findMany({
      where: {
        id: {
          in: questionIds,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (questions.length !== questionIds.length) {
      throw new NotFoundError(
        "One or more questions were not found.",
        ASSESSMENT_QUESTION_ERRORS.QUESTIONS_NOT_FOUND || "ASSESSMENT_QUESTIONS_NOT_FOUND"
      );
    }

    const archivedQuestions = questions.filter(
      (question) => question.status === QUESTION_STATUS.ARCHIVED
    );
    if (archivedQuestions.length > 0) {
      throw new BadRequestError(
        "Archived questions cannot be assigned to an assessment.",
        ASSESSMENT_QUESTION_ERRORS.QUESTION_INACTIVE || "ASSESSMENT_QUESTION_INACTIVE"
      );
    }

    const existingMarks = existingAssignments.reduce(
      (total, item) => total + (item.marks || 0),
      0
    );
    const incomingMarks = newQuestionsToAssign.reduce(
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

    const assignmentData = newQuestionsToAssign.map((question) => ({
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to modify this assessment.",
          ASSESSMENT_QUESTION_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
    }

    if (assessment.status === ASSESSMENT_STATUS.ARCHIVED) {
      throw new BadRequestError(
        "Questions cannot be reordered on archived assessments.",
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

    // Auto-normalize requested sequences if sent with 0-index or sequence gaps
    const sortedCheck = [...requestedSequences].sort((a, b) => a - b);
    const isDiscontinuous = sortedCheck.some((seq, idx) => seq !== idx + 1);
    if (isDiscontinuous) {
      requestedQuestions.forEach((item, idx) => {
        item.sequence = idx + 1;
      });
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

    if (assessment.status === ASSESSMENT_STATUS.PUBLISHED) {
      return assessment;
    }

    if (assessment.status !== ASSESSMENT_STATUS.DRAFT) {
      throw new ConflictError(
        "Only draft assessments can be published.",
        ASSESSMENT_ERRORS.INVALID_STATUS || "ASSESSMENT_INVALID_STATUS"
      );
    }

    const assessmentQuestions = assessment.questions ?? [];
    const assessmentGames = assessment.games ?? [];
    if (assessmentQuestions.length === 0 && assessmentGames.length === 0) {
      throw new BadRequestError(
        "At least one game or question is required before publishing the assessment.",
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

      if (question.status === QUESTION_STATUS.ARCHIVED) {
        throw new BadRequestError(
          "Archived questions cannot be part of a published assessment.",
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

    // Auto-normalize question sequence numbers (1..N) to heal any existing gaps or starting offsets
    const sortedAssessmentQuestions = [...assessmentQuestions].sort(
      (a, b) => (a.orderIndex ?? a.sequence ?? 0) - (b.orderIndex ?? b.sequence ?? 0)
    );

    sortedAssessmentQuestions.forEach((item, index) => {
      item.sequence = index + 1;
      item.orderIndex = index + 1;
    });

    const sequences = sortedAssessmentQuestions
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
      (total, item) => total + (item.points || item.marks || 1),
      0
    );

    if (assessmentQuestions.length > 0) {
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
      // Auto-normalize and persist continuous sequence numbers (1..N) in DB
      for (let i = 0; i < sortedAssessmentQuestions.length; i += 1) {
        await tx.assessmentQuestion.update({
          where: {
            assessmentId_questionId: {
              assessmentId,
              questionId: sortedAssessmentQuestions[i].questionId,
            },
          },
          data: {
            orderIndex: sortedAssessmentQuestions[i].sequence || sortedAssessmentQuestions[i].orderIndex || (i + 1),
          },
        });
      }

      const draftQuestionIds = assessmentQuestions
        .map((item) => item.question)
        .filter((q) => q && q.status === QUESTION_STATUS.DRAFT)
        .map((q) => q.id);

      if (draftQuestionIds.length > 0) {
        await tx.question.updateMany({
          where: { id: { in: draftQuestionIds } },
          data: { status: QUESTION_STATUS.PUBLISHED },
        });
      }

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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to unpublish this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
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

    // Auto-normalize question sequence numbers (1..N) to heal any existing gaps or starting offsets
    const sortedAssessmentQuestions = [...assessmentQuestions].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
    );

    sortedAssessmentQuestions.forEach((item, index) => {
      item.sequence = index + 1;
    });

    const sequences = sortedAssessmentQuestions
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, assessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to archive this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
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

    if (user?.role === "HR") {
      const isAuthorized = await this.isUserInSameCompany(user.id, sourceAssessment.createdById);
      if (!isAuthorized) {
        throw new ForbiddenError(
          "You do not have access to duplicate this assessment.",
          ASSESSMENT_ERRORS.ACCESS_DENIED || "ASSESSMENT_ACCESS_DENIED"
        );
      }
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

  /**
   * Delete Single Assessment Permanently (Hard Delete)
   */
  async deleteAssessment(assessmentId, userId, companyId = null) {
    const assessment = await assessmentRepository.findById(assessmentId, { detailed: false });
    if (!assessment) {
      throw new NotFoundError(
        "Assessment not found.",
        ASSESSMENT_ERRORS.NOT_FOUND || "ASSESSMENT_NOT_FOUND"
      );
    }

    await runTransaction(async (tx) => {
      await assessmentRepository.hardDeleteManyCascade(tx, [assessmentId]);
    });

    return {
      message: "Assessment permanently deleted successfully.",
      data: { id: assessmentId },
    };
  }

  /**
   * Bulk Delete Selected Assessments Permanently (Hard Delete)
   */
  async bulkDeleteAssessments(ids = [], userId, companyId = null) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError(
        "No assessment IDs provided for deletion.",
        "INVALID_BULK_DELETE"
      );
    }

    const assessments = await prisma.assessment.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (assessments.length === 0) {
      return {
        message: "No matching assessments found to delete.",
        count: 0,
        deletedCount: 0,
      };
    }

    const assessmentIds = assessments.map((a) => a.id);

    const deletedCount = await runTransaction(async (tx) => {
      return assessmentRepository.hardDeleteManyCascade(tx, assessmentIds);
    });

    return {
      message: deletedCount === 1
        ? "1 assessment deleted permanently."
        : `${deletedCount} assessments deleted permanently.`,
      count: deletedCount,
      deletedCount,
    };
  }

  /**
   * Delete All Assessments Permanently (Hard Delete for Company / User Scope)
   */
  async deleteAllAssessments(userId, companyId = null) {
    const where = {};
    if (companyId) {
      where.OR = [
        {
          createdBy: {
            companyMembers: {
              some: { companyId },
            },
          },
        },
        { createdById: userId },
      ];
    } else if (userId) {
      where.createdById = userId;
    }

    const all = await prisma.assessment.findMany({
      where,
      select: { id: true },
    });

    const ids = all.map((a) => a.id);
    if (!ids.length) {
      return {
        message: "No assessments found to delete.",
        count: 0,
        deletedCount: 0,
      };
    }

    return this.bulkDeleteAssessments(ids, userId, companyId);
  }
}

module.exports = new AssessmentService();
