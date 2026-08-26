const { ASSESSMENT_STATUS } = require("./assessment.constants");

/**
 * ==========================================================
 * Assessment Mapper
 * ==========================================================
 * Responsibilities:
 * - Normalize incoming assessment data
 * - Convert validated request data into persistence payloads
 * - Build safe update payloads
 * - Keep client-controlled and server-controlled fields separate
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * ==========================================================
 */
class AssessmentMapper {
  /**
   * Normalize Title
   */
  static normalizeTitle(title) {
    if (typeof title !== "string") {
      return title;
    }

    return title.trim().replace(/\s+/g, " ");
  }

  /**
   * Normalize Optional String
   */
  static normalizeOptionalString(value) {
    if (value === undefined || value === null) {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().replace(/\s+/g, " ");

    return normalized === "" ? null : normalized;
  }

  /**
   * Create Entity
   */
  static toCreateEntity(data, createdById) {
    return {
      title: this.normalizeTitle(data.title),

      description: this.normalizeOptionalString(data.description),

      instructions: this.normalizeOptionalString(data.instructions),

      durationMinutes: data.durationMinutes,

      passingScore: data.passingScore,

      maximumScore: data.maximumScore,

      maxAttempts: data.maxAttempts,

      type: data.type,

      difficulty: data.difficulty,

      status: ASSESSMENT_STATUS.DRAFT,

      publishAt: data.publishAt ?? null,

      startsAt: data.startsAt ?? null,

      endsAt: data.endsAt ?? null,

      createdById,
    };
  }

  /**
   * Update Entity
   */
  static toUpdateEntity(data) {
    const updateData = {};

    if (data.title !== undefined) {
      updateData.title = this.normalizeTitle(data.title);
    }

    if (data.description !== undefined) {
      updateData.description = this.normalizeOptionalString(data.description);
    }

    if (data.instructions !== undefined) {
      updateData.instructions = this.normalizeOptionalString(data.instructions);
    }

    if (data.durationMinutes !== undefined) {
      updateData.durationMinutes = data.durationMinutes;
    }

    if (data.passingScore !== undefined) {
      updateData.passingScore = data.passingScore;
    }

    if (data.maximumScore !== undefined) {
      updateData.maximumScore = data.maximumScore;
    }

    if (data.maxAttempts !== undefined) {
      updateData.maxAttempts = data.maxAttempts;
    }

    if (data.type !== undefined) {
      updateData.type = data.type;
    }

    if (data.difficulty !== undefined) {
      updateData.difficulty = data.difficulty;
    }

    if (data.publishAt !== undefined) {
      updateData.publishAt = data.publishAt;
    }

    if (data.startsAt !== undefined) {
      updateData.startsAt = data.startsAt;
    }

    if (data.endsAt !== undefined) {
      updateData.endsAt = data.endsAt;
    }

    return updateData;
  }

  /**
   * Create Audit Snapshot
   */
  static toAuditSnapshot(assessment) {
    if (!assessment) {
      return null;
    }

    return {
      id: assessment.id,

      title: assessment.title,

      description: assessment.description,

      instructions: assessment.instructions,

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      maxAttempts: assessment.maxAttempts,

      type: assessment.type,

      difficulty: assessment.difficulty,

      status: assessment.status,

      publishAt: assessment.publishAt,

      startsAt: assessment.startsAt,

      endsAt: assessment.endsAt,

      createdById: assessment.createdById,
    };
  }

  /**
   * Version Snapshot
   */
  static toVersionSnapshot(assessment) {
    if (!assessment) {
      return null;
    }

    return {
      title: assessment.title,

      description: assessment.description,

      instructions: assessment.instructions,

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      maxAttempts: assessment.maxAttempts,

      type: assessment.type,

      difficulty: assessment.difficulty,

      publishAt: assessment.publishAt,

      startsAt: assessment.startsAt,

      endsAt: assessment.endsAt,
    };
  }
}

module.exports = {
  AssessmentMapper,
};
