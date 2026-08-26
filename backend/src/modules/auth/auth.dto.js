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

    const { password, tokenVersion, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  static toCollection(users) {
    if (!Array.isArray(users)) return [];
    return users.map((user) => this.toResponse(user));
  }
}

module.exports = {
  AuthDto,
};
