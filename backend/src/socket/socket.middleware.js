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
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    // Verify token using existing utility
    const decodedUser = verifyAccessToken(token);

    // Fetch companyId if the user belongs to a company (HR/Admin)
    // Avoids trusting client-provided companyId
    let companyId = null;
    if (decodedUser.role !== "SUPER_ADMIN" && decodedUser.role !== "CANDIDATE") {
        const member = await prisma.companyMember.findFirst({
            where: { userId: decodedUser.sub },
            select: { companyId: true },
        });
        if (member) {
            companyId = member.companyId;
        }
    }

    // Attach user and company context to the socket
    socket.data.user = decodedUser;
    socket.data.companyId = companyId;

    // Join authorized rooms
    // 1. Personal room
    socket.join(`user:${decodedUser.sub}`);

    // 2. Company room (for HR/Recruiters)
    if (companyId) {
      socket.join(`company:${companyId}`);
    }

    // 3. Global HR room (for platform-wide updates like Game Status)
    if (decodedUser.role === "ADMIN" || decodedUser.role === "HR" || decodedUser.role === "OWNER") {
      socket.join("global:hr");
    }

    next();
  } catch (error) {
    logger.warn(`Socket connection rejected: ${error.message}`);
    next(new Error("Authentication error: Invalid token"));
  }
};

module.exports = socketMiddleware;
