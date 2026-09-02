/**
 * ==========================================================
 * Auth Mapper
 * ==========================================================
 * Responsible for:
 * - Mapping User payload to Database Entity creation format
 * - Mapping User domain entity to API Response
 * - Hiding sensitive database fields (password, tokenVersion, etc.)
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */

class AuthMapper {
  /**
   * Convert registration payload into DB User creation entity
   */
  static toCreateEntity(data) {
    if (!data) return null;

    const name =
      [data.firstName, data.lastName]
        .filter(Boolean)
        .map((s) => String(s).trim())
        .join(" ") ||
      data.name ||
      null;

    return {
      email: data.email ? data.email.toLowerCase().trim() : data.email,
      password: data.password,
      name,
      role: data.role || "HR",
    };
  }

  /**
   * Map User Domain Entity to Safe User Response Object
   */
  static toUserResponse(user) {
    if (!user) return null;

    const nameParts = (user.name || "").split(" ");
    const firstName = user.firstName || nameParts[0] || "";
    const lastName = user.lastName || nameParts.slice(1).join(" ") || "";

    return {
      id: user.id,
      firstName,
      lastName,
      fullName: user.name || `${firstName} ${lastName}`.trim(),
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toLoginResponse(user, accessToken) {
    return {
      user: this.toUserResponse(user),
      accessToken,
    };
  }

  static toRegisterResponse(user) {
    return {
      user: this.toUserResponse(user),
    };
  }

  static toRefreshTokenResponse(accessToken) {
    return {
      accessToken,
    };
  }

  static toLogoutResponse() {
    return {
      success: true,
    };
  }

  static toProfileResponse(user) {
    return {
      user: this.toUserResponse(user),
    };
  }
}

module.exports = {
  AuthMapper,
  toUserResponse: AuthMapper.toUserResponse.bind(AuthMapper),
  toCreateEntity: AuthMapper.toCreateEntity.bind(AuthMapper),
  toLoginResponse: AuthMapper.toLoginResponse.bind(AuthMapper),
  toRegisterResponse: AuthMapper.toRegisterResponse.bind(AuthMapper),
  toRefreshTokenResponse: AuthMapper.toRefreshTokenResponse.bind(AuthMapper),
  toLogoutResponse: AuthMapper.toLogoutResponse.bind(AuthMapper),
  toProfileResponse: AuthMapper.toProfileResponse.bind(AuthMapper),
};
