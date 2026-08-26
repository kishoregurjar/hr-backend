/**
 * ==========================================================
 * Category Data Transfer Object (DTO)
 * ==========================================================
 * Sanitizes and formats Category database models into client-safe payloads.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class CategoryDto {
  static toResponse(category) {
    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  static toListResponse(category) {
    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      isActive: category.isActive,
    };
  }

  static toSummary(category) {
    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
    };
  }

  static toAdminListResponse(category) {
    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      isActive: category.isActive,
      questionCount: category._count?.questions || 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  static toCollection(categories, transformFn = CategoryDto.toListResponse) {
    if (!Array.isArray(categories)) return [];
    return categories.map((cat) => transformFn(cat));
  }
}

module.exports = {
  CategoryDto,
};
