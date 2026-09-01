/**
 * ==========================================================
 * Tag Data Mapper
 * ==========================================================
 * Converts HTTP request objects into persistence-ready entities,
 * handles string normalization, and builds audit & version snapshots.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

class TagMapper {
  static normalizeName(name) {
    if (typeof name !== "string") return "";
    return name
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  static toCreateEntity(data, userId) {
    return {
      name: data.name.trim().replace(/\s+/g, " "),
      description: data.description ? data.description.trim() : null,
      isActive: true,
    };
  }

  static toUpdateEntity(data, userId) {
    const payload = {};

    if (data.name) {
      payload.name = data.name.trim().replace(/\s+/g, " ");
    }

    if (data.description !== undefined) {
      payload.description = data.description ? data.description.trim() : null;
    }

    if (data.isActive !== undefined) {
      payload.isActive = Boolean(data.isActive);
    }

    return payload;
  }

  static toAuditPayload(tag, action) {
    return {
      entity: "QUESTION_TAG",
      entityId: tag.id,
      action,
      snapshot: TagMapper.toVersionSnapshot(tag),
    };
  }

  static toVersionSnapshot(tag) {
    if (!tag) return null;

    return {
      id: tag.id,
      name: tag.name,
      description: tag.description || null,
      isActive: tag.isActive,
    };
  }
}

module.exports = {
  TagMapper,
};
