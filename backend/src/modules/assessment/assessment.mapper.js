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

      durationMinutes: data.durationMinutes !== undefined ? data.durationMinutes : 60,

      passingScore: data.passingScore !== undefined ? data.passingScore : 60,

      maximumScore: data.maximumScore !== undefined ? data.maximumScore : 100,

      type: data.type || "TECHNICAL",

      status: ASSESSMENT_STATUS.DRAFT,

      startsAt: data.startsAt ? new Date(data.startsAt) : null,

      endsAt: data.endsAt ? new Date(data.endsAt) : null,

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

    if (data.durationMinutes !== undefined) {
      updateData.durationMinutes = data.durationMinutes;
    }

    if (data.passingScore !== undefined) {
      updateData.passingScore = data.passingScore;
    }

    if (data.maximumScore !== undefined) {
      updateData.maximumScore = data.maximumScore;
    }

    if (data.type !== undefined) {
      updateData.type = data.type;
    }

    if (data.startsAt !== undefined) {
      updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    }

    if (data.endsAt !== undefined) {
      updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;
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

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      type: assessment.type,

      status: assessment.status,

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

      durationMinutes: assessment.durationMinutes,

      passingScore: assessment.passingScore,

      maximumScore: assessment.maximumScore,

      type: assessment.type,

      startsAt: assessment.startsAt,

      endsAt: assessment.endsAt,
    };
  }
}

module.exports = {
  AssessmentMapper,
};
