"use strict";

const { verifyAccessToken } = require("../modules/auth/auth.utils");
const { prisma } = require("../config/prisma");
const logger = require("../config/logger");

/**
 * Socket.IO Authentication Middleware
 * 
 * Verifies JWT token from handshake and fetches user's company information.
 * Follows the existing auth utility logic.
 */
const socketMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    let decodedUser = null;
    if (token) {
      try {
        decodedUser = verifyAccessToken(token);
      } catch (err) {
        logger.warn(`Socket token verification failed: ${err.message}`);
      }
    }

    if (!decodedUser) {
      socket.data.user = { sub: "anonymous", role: "GUEST" };
      socket.data.companyId = null;
      socket.join("global:hr");
      return next();
    }

    let companyId = null;
    const userRole = String(decodedUser.role || "").toUpperCase();

    if (userRole !== "SUPER_ADMIN" && userRole !== "CANDIDATE") {
      try {
        const member = await prisma.companyMember.findFirst({
          where: { userId: decodedUser.sub },
          select: { companyId: true },
        });
        if (member) {
          companyId = member.companyId;
        }
      } catch (e) {
        logger.error("Error fetching companyId for socket:", e);
      }
    }

    socket.data.user = decodedUser;
    socket.data.companyId = companyId;

    // Join authorized rooms
    if (decodedUser.sub) {
      socket.join(`user:${decodedUser.sub}`);
    }

    if (companyId) {
      socket.join(`company:${companyId}`);
    }

    // Global HR & Platform updates room for all admin, recruiter, super_admin, owner roles
    socket.join("global:hr");

    next();
  } catch (error) {
    logger.error(`Socket middleware unexpected error: ${error.message}`);
    socket.join("global:hr");
    next();
  }
};

module.exports = socketMiddleware;
