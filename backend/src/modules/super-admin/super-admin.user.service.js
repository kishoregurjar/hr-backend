"use strict";

const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const superAdminUserRepository = require("./super-admin.user.repository");
const { mapUserListItem } = require("./super-admin.user.mapper");
const { buildUserListResponse } = require("./super-admin.user.dto");
const { SUPER_ADMIN_USER_CONSTANTS } = require("./super-admin.user.constants");
const ownerActivationService = require("./super-admin.owner-activation.service");
const activationRepository = require("./super-admin.owner-activation.repository");
const { encryptToken } = require("./super-admin.owner-activation.crypto");
const emailRepository = require("../company/company.email.repository");
const { createOutboxEvent } = require("../company/company.outbox.repository");
const { COMPANY_OUTBOX_CONSTANTS } = require("../company/company.outbox.constants");

/**
 * Pure helper function to construct Prisma where clauses for user directory search/filters.
 * Automatically excludes CANDIDATE users from the Super Admin User Directory.
 */
const buildUserWhere = ({ search, role, status }) => {
  const where = {
    role: role
      ? role
      : {
          in: [
            SUPER_ADMIN_USER_CONSTANTS.ROLES.SUPER_ADMIN,
            SUPER_ADMIN_USER_CONSTANTS.ROLES.HR,
          ],
        },
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
};

/**
 * List platform users for Super Admin directory with pagination, filtering, and sorting
 */
const listUsers = async ({
  page,
  limit,
  search,
  role,
  status,
  sortBy,
  sortOrder,
}) => {
  const skip = (page - 1) * limit;
  const where = buildUserWhere({ search, role, status });
  const orderBy = { [sortBy]: sortOrder };

  const result = await superAdminUserRepository.findUsers({
    where,
    skip,
    take: limit,
    orderBy,
  });

  return buildUserListResponse({
    users: result.users.map(mapUserListItem),
    page,
    limit,
    total: result.total,
  });
};

/**
 * Invite a new Platform Admin (SUPER_ADMIN)
 */
const invitePlatformAdmin = async ({ name, email }) => {
  const existingUser = await superAdminUserRepository.findUserByEmail(email);

  if (existingUser) {
    if (existingUser.status === "ACTIVE") {
      const error = new Error(
        "An active user account with this email address already exists."
      );
      error.statusCode = 409;
      error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.USER_ALREADY_ACTIVE;
      throw error;
    }

    if (existingUser.status === "SUSPENDED") {
      const error = new Error(
        "This user account is suspended and cannot be invited."
      );
      error.statusCode = 409;
      error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.USER_SUSPENDED;
      throw error;
    }

    if (existingUser.status === "DEACTIVATED") {
      const error = new Error(
        "This user account is deactivated and cannot be invited."
      );
      error.statusCode = 409;
      error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.USER_DEACTIVATED;
      throw error;
    }

    if (existingUser.status === "INVITED") {
      // Reuse existing invitation flow by resending invitation token
      return resendPlatformAdminInvitation(existingUser.id);
    }
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const user = await superAdminUserRepository.createUser(
          {
            name,
            email,
            password: null,
            role: "SUPER_ADMIN",
            status: "INVITED",
          },
          tx
        );

        const { activation, rawToken, activationUrl } =
          await ownerActivationService.createOwnerActivation(user.id, tx);

        const emailDelivery = await tx.emailDelivery.create({
          data: {
            type: "COMPANY_OWNER_ACTIVATION",
            activationId: activation.id,
            recipientEmail: email,
            status: "PENDING",
          },
        });

        await createOutboxEvent(
          {
            eventType:
              COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES
                .COMPANY_OWNER_ACTIVATION_EMAIL,
            aggregateId: activation.id,
            payload: {
              emailDeliveryId: emailDelivery.id,
              activationId: activation.id,
              recipientEmail: email,
              ownerName: name,
              companyName: "HireQuest Platform",
              activationUrl,
            },
          },
          tx
        );

        return mapUserListItem(user);
      },
      {
        isolationLevel: "Serializable",
      }
    );
  } catch (error) {
    if (error.code === "P2002") {
      const conflictError = new Error(
        "A user account with this email address already exists."
      );
      conflictError.statusCode = 409;
      conflictError.code =
        SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.EMAIL_ALREADY_EXISTS;
      throw conflictError;
    }

    throw error;
  }
};

/**
 * Resend invitation for an invited Platform Admin (SUPER_ADMIN)
 */
const resendPlatformAdminInvitation = async (userId) => {
  return prisma.$transaction(
    async (tx) => {
      const user = await superAdminUserRepository.findUserById(userId, tx);

      if (!user || user.role !== "SUPER_ADMIN") {
        const error = new Error("Platform Admin user not found.");
        error.statusCode = 404;
        error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.USER_NOT_FOUND;
        throw error;
      }

      if (user.status === "ACTIVE") {
        const error = new Error("This user account is already active.");
        error.statusCode = 409;
        error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.USER_ALREADY_ACTIVE;
        throw error;
      }

      if (user.status !== "INVITED") {
        const error = new Error(
          "Only invited accounts can receive invitation resends."
        );
        error.statusCode = 409;
        error.code = SUPER_ADMIN_USER_CONSTANTS.ERROR_CODES.INVALID_STATUS;
        throw error;
      }

      let activation = await activationRepository.findByUserId(userId, tx);

      let updatedActivation;
      let rawToken;

      const generateToken = () => {
        const raw = crypto.randomBytes(32).toString("hex");
        const hash = crypto.createHash("sha256").update(raw).digest("hex");
        return {
          rawToken: raw,
          tokenHash: hash,
          encryptedToken: encryptToken(raw),
        };
      };

      if (!activation) {
        const created = await ownerActivationService.createOwnerActivation(
          userId,
          tx
        );
        updatedActivation = created.activation;
        rawToken = created.rawToken;
      } else {
        const tokenData = generateToken();
        rawToken = tokenData.rawToken;
        const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

        updatedActivation = await activationRepository.rotateActivation(
          activation.id,
          {
            tokenHash: tokenData.tokenHash,
            encryptedToken: tokenData.encryptedToken,
            expiresAt,
          },
          tx
        );
      }

      let emailDelivery = await emailRepository.findByActivationId(
        updatedActivation.id,
        tx
      );

      if (!emailDelivery) {
        emailDelivery = await emailRepository.createEmailDelivery(
          {
            type: "COMPANY_OWNER_ACTIVATION",
            activationId: updatedActivation.id,
            recipientEmail: user.email,
            status: "PENDING",
          },
          tx
        );
      } else {
        emailDelivery = await emailRepository.resetForRetry(
          emailDelivery.id,
          tx
        );
      }

      await createOutboxEvent(
        {
          eventType:
            COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES
              .COMPANY_OWNER_ACTIVATION_EMAIL,
          aggregateId: updatedActivation.id,
          payload: {
            emailDeliveryId: emailDelivery.id,
            activationId: updatedActivation.id,
            recipientEmail: user.email,
            ownerName: user.name,
            companyName: "HireQuest Platform",
          },
        },
        tx
      );

      return mapUserListItem(user);
    },
    {
      isolationLevel: "Serializable",
    }
  );
};

module.exports = {
  buildUserWhere,
  listUsers,
  invitePlatformAdmin,
  resendPlatformAdminInvitation,
};
