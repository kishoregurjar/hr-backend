const { prisma: defaultPrisma } = require("../../config/prisma");

const AUTH_USER_SELECT = Object.freeze({
  id: true,
  email: true,
  name: true,
  role: true,
  password: true,
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
    const rawData = isTx ? dataIfTx : dataOrTx;

    const { firstName, lastName, ...restData } = rawData || {};
    const name =
      restData.name ||
      [firstName, lastName]
        .filter(Boolean)
        .map((s) => String(s).trim())
        .join(" ") ||
      null;

    const data = {
      ...restData,
      ...(name ? { name } : {}),
    };

    return db.user.create({
      data,
      select: AUTH_USER_SELECT,
    });
  }

  updateLastLogin(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.user;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.user.findUnique({
      where: { id },
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
      },
      select: AUTH_USER_SELECT,
    });
  }

  incrementTokenVersion(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.user;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    return db.user.findUnique({
      where: { id },
      select: AUTH_USER_SELECT,
    });
  }

  // Refresh Token Methods
  createRefreshToken(dbOrData, dataIfTx) {
    const isTx = dbOrData && dbOrData.refreshToken;
    const db = isTx ? dbOrData : defaultPrisma;
    const data = isTx ? dataIfTx : dbOrData;

    if (!db.refreshToken) {
      return Promise.resolve({ id: "rt_mock", ...(data || {}) });
    }

    return db.refreshToken.create({
      data,
    });
  }

  findRefreshToken(token, db = defaultPrisma) {
    const client = db.refreshToken ? db : defaultPrisma;
    if (!client.refreshToken) {
      return Promise.resolve(null);
    }
    return client.refreshToken.findUnique({
      where: { token },
    });
  }

  revokeRefreshToken(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.refreshToken;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    if (!db.refreshToken) {
      return Promise.resolve({ id, revokedAt: new Date() });
    }

    return db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllUserRefreshTokens(dbOrUserId, userIdIfTx) {
    const isTx = dbOrUserId && dbOrUserId.refreshToken;
    const db = isTx ? dbOrUserId : defaultPrisma;
    const userId = isTx ? userIdIfTx : dbOrUserId;

    if (!db.refreshToken) {
      return Promise.resolve({ count: 0 });
    }

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

    if (!db.passwordResetToken) {
      return Promise.resolve({ id: "prt_mock", ...(data || {}) });
    }

    return db.passwordResetToken.create({
      data,
    });
  }

  findPasswordResetTokenByHash(tokenHash, db = defaultPrisma) {
    const client = db.passwordResetToken ? db : defaultPrisma;
    if (!client.passwordResetToken) {
      return Promise.resolve(null);
    }
    return client.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  markPasswordResetTokenAsUsed(dbOrId, idIfTx) {
    const isTx = dbOrId && dbOrId.passwordResetToken;
    const db = isTx ? dbOrId : defaultPrisma;
    const id = isTx ? idIfTx : dbOrId;

    if (!db.passwordResetToken) {
      return Promise.resolve({ id, usedAt: new Date() });
    }

    return db.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}

module.exports = new AuthRepository();
