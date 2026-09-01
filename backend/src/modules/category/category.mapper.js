/**
 * ==========================================================
 * Category Data Mapper
 * ==========================================================
 * Converts HTTP request objects into persistence-ready entities,
 * handles string normalization, and builds audit & version snapshots.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

class CategoryMapper {
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

    return payload;
  }

  static toAuditPayload(category, action) {
    return {
      entity: "QUESTION_CATEGORY",
      entityId: category.id,
      action,
      snapshot: CategoryMapper.toVersionSnapshot(category),
    };
  }

  static toVersionSnapshot(category) {
    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      isActive: category.isActive,
    };
  }
}

module.exports = {
  CategoryMapper,
};
