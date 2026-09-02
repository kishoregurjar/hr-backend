/**
 * ==========================================================
 * Enterprise Auth DTO
 * ==========================================================
 * Client response sanitizers for Authentication module.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class AuthDto {
  static toResponse(user) {
    if (!user) return null;

    const nameParts = (user.name || "").split(" ");
    const firstName = user.firstName || nameParts[0] || "";
    const lastName = user.lastName || nameParts.slice(1).join(" ") || "";

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName,
      lastName,
      fullName: user.name || `${firstName} ${lastName}`.trim(),
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toCollection(users) {
    if (!Array.isArray(users)) return [];
    return users.map((user) => this.toResponse(user));
  }
}

module.exports = {
  AuthDto,
};
