const { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } = require("../../common/errors");
const { runTransaction } = require("../../common/transaction");
const authRepository = require("./auth.repository");
const { AuthMapper } = require("./auth.mapper");
const { AuthDto } = require("./auth.dto");
const {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} = require("./auth.utils");

const { prisma } = require("../../config/prisma");

const assertUserCanLogin = (user) => {
  switch (user.status) {
    case "ACTIVE":
      return;

    case "INVITED": {
      const error = new Error("Account not activated. Please activate your account via email.");
      error.statusCode = 403;
      error.code = "ACCOUNT_NOT_ACTIVATED";
      throw error;
    }

    case "SUSPENDED": {
      const error = new Error("Your account has been suspended.");
      error.statusCode = 403;
      error.code = "ACCOUNT_SUSPENDED";
      throw error;
    }

    case "DEACTIVATED": {
      const error = new Error("Your account has been deactivated.");
      error.statusCode = 403;
      error.code = "ACCOUNT_DEACTIVATED";
      throw error;
    }

    default: {
      const error = new Error("Login not allowed for this account status.");
      error.statusCode = 403;
      error.code = "ACCOUNT_LOGIN_NOT_ALLOWED";
      throw error;
    }
  }
};

/**
 * ==========================================================
 * Enterprise Auth Service
 * ==========================================================
 * Single Domain Service class handling all Authentication & Authorization operations.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class AuthService {
  async getUserCompanies(userId) {
    const memberships = await prisma.companyMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        companyId: true,
        role: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            website: true,
            industry: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            country: true,
            description: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      slug: m.company.slug,
      status: m.company.status,
      logoUrl: m.company.logoUrl || null,
      website: m.company.website || null,
      websiteUrl: m.company.website || null,
      industry: m.company.industry || null,
      email: m.company.email || null,
      officialEmail: m.company.email || null,
      phone: m.company.phone || null,
      address: m.company.address || null,
      city: m.company.city || null,
      country: m.company.country || null,
      description: m.company.description || null,
      about: m.company.description || null,
      role: m.role,
    }));
  }

  async register(payload) {
    const email = payload.email.toLowerCase().trim();

    const existingUser = await authRepository.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictError("User with this email already exists.", "EMAIL_ALREADY_EXISTS");
    }

    const hashedPassword = await hashPassword(payload.password);

    const user = await runTransaction(async (tx) => {
      const userData = AuthMapper.toCreateEntity({
        ...payload,
        email,
        password: hashedPassword,
      });

      return authRepository.createUser(tx, userData);
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await authRepository.createRefreshToken({
      userId: user.id,
      token: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
      message: "User registered successfully.",
      accessToken,
      refreshToken,
      user: AuthMapper.toUserResponse(user),
    };
  }

  async login(payload) {
    const email = payload.email.toLowerCase().trim();

    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    assertUserCanLogin(user);

    const isPasswordValid = await comparePassword(payload.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await runTransaction(async (tx) => {
      await authRepository.updateLastLogin(tx, user.id);
      await authRepository.createRefreshToken(tx, {
        userId: user.id,
        token: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    const companies = await this.getUserCompanies(user.id);

    return {
      message: "Login successful.",
      accessToken,
      refreshToken,
      user: AuthMapper.toUserResponse(user),
      companies,
    };
  }

  async refreshAccessToken(refreshTokenStr) {
    if (!refreshTokenStr) {
      throw new UnauthorizedError("Refresh token is required.", "REFRESH_TOKEN_REQUIRED");
    }

    const tokenHash = hashToken(refreshTokenStr);
    const storedToken = await authRepository.findRefreshToken(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError("Invalid or expired refresh token.", "INVALID_REFRESH_TOKEN");
    }

    // Enterprise Grace Period: Allow 60-second window for recently revoked tokens
    // to handle multi-device concurrent sessions and parallel network calls without session drops
    const isGracePeriodActive =
      storedToken.revokedAt &&
      new Date().getTime() - new Date(storedToken.revokedAt).getTime() < 60000;

    if ((storedToken.revokedAt && !isGracePeriodActive) || new Date() > storedToken.expiresAt) {
      throw new UnauthorizedError("Invalid or expired refresh token.", "INVALID_REFRESH_TOKEN");
    }

    const user = await authRepository.findUserById(storedToken.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("User is invalid or inactive.", "USER_INVALID");
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    if (!isGracePeriodActive) {
      await runTransaction(async (tx) => {
        await authRepository.revokeRefreshToken(tx, storedToken.id);
        await authRepository.createRefreshToken(tx, {
          userId: user.id,
          token: hashToken(newRefreshToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      });
    }

    return {
      message: "Token refreshed successfully.",
      accessToken: newAccessToken,
      refreshToken: isGracePeriodActive ? refreshTokenStr : newRefreshToken,
      user: AuthMapper.toUserResponse(user),
    };
  }

  async logout(refreshTokenStr) {
    if (refreshTokenStr) {
      const tokenHash = hashToken(refreshTokenStr);
      const storedToken = await authRepository.findRefreshToken(tokenHash);
      if (storedToken && !storedToken.revokedAt) {
        await authRepository.revokeRefreshToken(storedToken.id);
      }
    }

    return {
      message: "Logged out successfully.",
    };
  }

  async logoutAllDevices(userId) {
    await runTransaction(async (tx) => {
      await authRepository.incrementTokenVersion(tx, userId);
      await authRepository.revokeAllUserRefreshTokens(tx, userId);
    });

    return {
      message: "Logged out from all devices successfully.",
    };
  }

  async changePassword(userId, payload) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found.", "USER_NOT_FOUND");
    }

    const isCurrentValid = await comparePassword(payload.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestError("Current password is incorrect.", "INCORRECT_CURRENT_PASSWORD");
    }

    const hashedNewPassword = await hashPassword(payload.newPassword);

    await runTransaction(async (tx) => {
      await authRepository.updatePassword(tx, userId, hashedNewPassword);
      await authRepository.revokeAllUserRefreshTokens(tx, userId);
    });

    return {
      message: "Password changed successfully. Please login again.",
    };
  }

  async forgotPassword(payload) {
    const email = payload.email.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(email);

    if (user && user.isActive) {
      const rawToken = hashToken(`${user.id}-${Date.now()}`);
      const tokenHash = hashToken(rawToken);

      await authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    }

    return {
      message: "If an account exists with that email, a password reset link has been sent.",
    };
  }

  async resetPassword(payload) {
    const tokenHash = hashToken(payload.token);
    const resetToken = await authRepository.findPasswordResetTokenByHash(tokenHash);

    if (!resetToken || resetToken.usedAt || new Date() > resetToken.expiresAt) {
      throw new BadRequestError("Invalid or expired reset token.", "INVALID_RESET_TOKEN");
    }

    const hashedNewPassword = await hashPassword(payload.newPassword);

    await runTransaction(async (tx) => {
      await authRepository.updatePassword(tx, resetToken.userId, hashedNewPassword);
      await authRepository.markPasswordResetTokenAsUsed(tx, resetToken.id);
      await authRepository.revokeAllUserRefreshTokens(tx, resetToken.userId);
    });

    return {
      message: "Password reset successful. Please login with your new password.",
    };
  }
}

const authService = new AuthService();

module.exports = authService;
