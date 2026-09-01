const { prisma: defaultPrisma } = require("../../config/prisma");

const AUTH_USER_SELECT = Object.freeze({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  password: true,
  isActive: true,
  emailVerified: true,
  tokenVersion: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
});

class AuthRepository {
  findUserByEmail(email, db = defaultPrisma) {
    const client = db.user ? db : defaultPrisma;
    return client.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: AUTH_USER_SELECT,
    });
  }

  findUserById(id, db = defaultPrisma) {
    const client = db.user ? db : defaultPrisma;
    return client.user.findUnique({
      where: { id },
      select: AUTH_USER_SELECT,
    });
  }

  createUser(dataOrTx, dataIfTx) {
    const isTx = dataOrTx && dataOrTx.user;
    const db = isTx ? dataOrTx : defaultPrisma;
    const data = isTx ? dataIfTx : dataOrTx;

    return db.user.create({
      data,
      select: AUTH_USER_SELECT,
    });
  }

  updateLastLogin(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.user;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      select: AUTH_USER_SELECT,
    });
  }

  updatePassword(dbOrId, idOrPassword, passwordIfTx) {
    const isTx = dbOrId && dbOrId.user;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idOrPassword : dbOrId;
    const password = isTx ? passwordIfTx : idOrPassword;

    return db.user.update({
      where: { id },
      data: {
        password,
        tokenVersion: { increment: 1 },
      },
      select: AUTH_USER_SELECT,
    });
  }

  incrementTokenVersion(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.user;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.user.update({
      where: { id },
      data: {
        tokenVersion: { increment: 1 },
      },
      select: AUTH_USER_SELECT,
    });
  }

  // Refresh Token Methods
  createRefreshToken(dbOrData, dataIfTx) {
    const isTx = dbOrData && dbOrData.refreshToken;
    const db = isTx ? dbOrData : defaultPrisma;
    const data = isTx ? dataIfTx : dbOrData;

    return db.refreshToken.create({
      data,
    });
  }

  findRefreshToken(token, db = defaultPrisma) {
    const client = db.refreshToken ? db : defaultPrisma;
    return client.refreshToken.findUnique({
      where: { token },
    });
  }

  revokeRefreshToken(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.refreshToken;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllUserRefreshTokens(dbOrUserId, userIdIfTx) {
    const isTx = dbOrUserId && dbOrUserId.refreshToken;
    const db = isTx ? dbOrUserId : defaultPrisma;
    const userId = isTx ? userIdIfTx : dbOrUserId;

    return db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Password Reset Methods
  createPasswordResetToken(dbOrData, dataIfTx) {
    const isTx = dbOrData && dbOrData.passwordResetToken;
    const db = isTx ? dbOrData : defaultPrisma;
    const data = isTx ? dataIfTx : dbOrData;

    return db.passwordResetToken.create({
      data,
    });
  }

  findPasswordResetTokenByHash(tokenHash, db = defaultPrisma) {
    const client = db.passwordResetToken ? db : defaultPrisma;
    return client.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  markPasswordResetTokenAsUsed(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.passwordResetToken;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}

module.exports = new AuthRepository();
