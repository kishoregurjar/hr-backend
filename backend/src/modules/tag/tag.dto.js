/**
 * ==========================================================
 * Tag Data Transfer Object (DTO)
 * ==========================================================
 * Sanitizes and formats Tag database models into client-safe payloads.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class TagDto {
  static toResponse(tag) {
    if (!tag) return null;

    return {
      id: tag.id,
      name: tag.name,
      description: tag.description || null,
      isActive: tag.isActive,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }

  static toListResponse(tag) {
    if (!tag) return null;

    return {
      id: tag.id,
      name: tag.name,
      description: tag.description || null,
      isActive: tag.isActive,
    };
  }

  static toSummary(tag) {
    if (!tag) return null;

    return {
      id: tag.id,
      name: tag.name,
    };
  }

  static toAdminListResponse(tag) {
    if (!tag) return null;

    return {
      id: tag.id,
      name: tag.name,
      description: tag.description || null,
      isActive: tag.isActive,
      questionCount: tag._count?.questionTags || 0,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }

  static toCollection(tags, transformFn = TagDto.toListResponse) {
    if (!Array.isArray(tags)) return [];
    return tags.map((t) => transformFn(t));
  }
}

module.exports = {
  TagDto,
};
