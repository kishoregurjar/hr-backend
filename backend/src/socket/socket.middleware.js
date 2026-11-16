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
      // Guest or unauthenticated sockets NEVER join privileged global:hr or company rooms
      return next();
    }

    let companyId = null;
    const userRole = String(decodedUser.role || "").toUpperCase();

    // Candidates only join their individual user room
    if (userRole === "CANDIDATE") {
      socket.data.user = decodedUser;
      socket.data.companyId = null;
      if (decodedUser.sub) {
        socket.join(`user:${decodedUser.sub}`);
      }
      return next();
    }

    // Super Admin platform access remains unrestricted
    if (userRole === "SUPER_ADMIN") {
      socket.data.user = decodedUser;
      socket.data.companyId = null;
      if (decodedUser.sub) {
        socket.join(`user:${decodedUser.sub}`);
      }
      socket.join("global:hr");
      return next();
    }

    // Tenant HR, Admin, Owner: Resolve exact company membership and subscription status
    let member = null;
    try {
      member = await prisma.companyMember.findFirst({
        where: { userId: decodedUser.sub },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              plan: true,
              planStatus: true,
              planExpiresAt: true,
            },
          },
        },
      });
      if (member) {
        companyId = member.companyId;
      }
    } catch (e) {
      logger.error("Error fetching company context for socket:", e);
    }

    if (!member || !member.company) {
      socket.data.user = decodedUser;
      socket.data.companyId = null;
      return next();
    }

    if (member.company.status === "SUSPENDED") {
      logger.warn(`Socket connection rejected for suspended company ${member.company.id} (User: ${decodedUser.sub})`);
      const err = new Error("COMPANY_SUSPENDED: Your company account has been suspended.");
      err.data = { code: "COMPANY_SUSPENDED" };
      return next(err);
    }

    // Centralized Plan Expiry Enforcement on Socket Handshake
    const { checkCompanyPlanStatus } = require("../modules/plan");
    const planCheck = await checkCompanyPlanStatus(member.company);
    if (planCheck.isExpired) {
      logger.warn(`Socket connection rejected for expired company ${member.company.id} (User: ${decodedUser.sub})`);
      const err = new Error("PLAN_EXPIRED: Your subscription has expired. Please renew your plan to continue.");
      err.data = { code: "PLAN_EXPIRED" };
      return next(err);
    }

    socket.data.user = decodedUser;
    socket.data.companyId = companyId;

    // Join authorized rooms for active subscribers
    if (decodedUser.sub) {
      socket.join(`user:${decodedUser.sub}`);
    }

    if (companyId) {
      socket.join(`company:${companyId}`);
    }

    // Global HR updates room only for active subscribers
    socket.join("global:hr");

    next();
  } catch (error) {
    logger.error(`Socket middleware unexpected error: ${error.message}`);
    return next(error);
  }
};

module.exports = socketMiddleware;
