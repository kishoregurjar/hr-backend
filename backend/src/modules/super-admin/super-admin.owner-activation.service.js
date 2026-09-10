"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { prisma } = require("../../config/prisma");
const env = require("../../config/env");
const activationRepository = require("./super-admin.owner-activation.repository");
const { SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS } = require("./super-admin.owner-activation.constants");
const { encryptToken, decryptToken } = require("./super-admin.owner-activation.crypto");

const generateActivationToken = () => {
  const rawToken = crypto
    .randomBytes(SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.TOKEN.BYTE_LENGTH)
    .toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  return {
    rawToken,
    tokenHash,
  };
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const buildOwnerActivationUrl = (rawToken) => {
  const frontendUrl = env.frontend.url;
  const url = new URL("/activate-owner", frontendUrl);
  url.searchParams.set("token", rawToken);
  return url.toString();
};

const createOwnerActivation = async (userId, tx = prisma) => {
  const { rawToken, tokenHash } = generateActivationToken();
  const encryptedToken = encryptToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() +
      SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.TOKEN.EXPIRATION_DAYS
  );

  const activation = await activationRepository.createActivation(
    {
      userId,
      tokenHash,
      encryptedToken,
      status: "PENDING",
      expiresAt,
    },
    tx
  );

  return {
    activation,
    rawToken,
    activationUrl: buildOwnerActivationUrl(rawToken),
  };
};

const superAdminCompanyRepository = require("./super-admin.company.repository");
const emailRepository = require("../company/company.email.repository");
const { createOutboxEvent } = require("../company/company.outbox.repository");
const { COMPANY_OUTBOX_CONSTANTS } = require("../company/company.outbox.constants");

const consumeActivation = async (token, newPassword) => {
  const tokenHash = hashToken(token);

  return prisma.$transaction(
    async (tx) => {
      const activation = await activationRepository.findByTokenHash(
        tokenHash,
        tx
      );

      if (!activation) {
        const error = new Error(
          "This activation link is invalid, expired, or has already been replaced by a newer invitation link."
        );
        error.statusCode = 400;
        error.code =
          SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.ERROR_CODES.ACTIVATION_NOT_FOUND;
        throw error;
      }

      if (activation.status === "CONSUMED") {
        const error = new Error(
          "This workspace activation link has already been used. Please log in with your password."
        );
        error.statusCode = 400;
        error.code =
          SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.ERROR_CODES.ACTIVATION_ALREADY_USED;
        throw error;
      }

      if (activation.status === "REVOKED") {
        const error = new Error(
          "This activation link has been revoked by an administrator. Please request a new link."
        );
        error.statusCode = 400;
        error.code =
          SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.ERROR_CODES.ACTIVATION_REVOKED;
        throw error;
      }

      if (activation.expiresAt.getTime() <= Date.now()) {
        await activationRepository.markExpired(activation.id, tx);
        const error = new Error(
          "This activation link has expired. Please ask your administrator to resend a new link."
        );
        error.statusCode = 400;
        error.code =
          SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.ERROR_CODES.ACTIVATION_EXPIRED;
        throw error;
      }

      if (activation.user.status === "ACTIVE") {
        const error = new Error(
          "This workspace owner account is already active. Please sign in directly."
        );
        error.statusCode = 409;
        error.code =
          SUPER_ADMIN_OWNER_ACTIVATION_CONSTANTS.ERROR_CODES.USER_ALREADY_ACTIVE;
        throw error;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      const now = new Date();

      const user = await tx.user.update({
        where: {
          id: activation.userId,
        },
        data: {
          password: passwordHash,
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });

      const consumedTokenHash = crypto
        .createHash("sha256")
        .update(`${activation.id}:${crypto.randomUUID()}`)
        .digest("hex");

      await tx.companyOwnerActivation.update({
        where: { id: activation.id },
        data: {
          status: "CONSUMED",
          consumedAt: now,
          tokenHash: consumedTokenHash,
          encryptedToken: "",
        },
      });

      return user;
    },
    {
      isolationLevel: "Serializable",
    }
  );
};

const resendOwnerActivation = async ({ companyId }) => {
  return prisma.$transaction(
    async (tx) => {
      const owner = await superAdminCompanyRepository.findCompanyOwner(companyId, tx);

      if (!owner) {
        const error = new Error("Company owner not found");
        error.statusCode = 404;
        error.code = "COMPANY_OWNER_NOT_FOUND";
        throw error;
      }

      if (owner.user.status === "ACTIVE") {
        const error = new Error("Company owner is already active");
        error.statusCode = 409;
        error.code = "OWNER_ALREADY_ACTIVE";
        throw error;
      }

      const activation = await activationRepository.findByUserId(owner.user.id, tx);

      if (!activation) {
        const error = new Error("Owner activation not found");
        error.statusCode = 404;
        error.code = "OWNER_ACTIVATION_NOT_FOUND";
        throw error;
      }

      if (activation.status === "CONSUMED") {
        const error = new Error("Owner activation has already been consumed");
        error.statusCode = 409;
        error.code = "ACTIVATION_ALREADY_CONSUMED";
        throw error;
      }

      const { rawToken, tokenHash } = generateActivationToken();
      const encryptedToken = encryptToken(rawToken);
      const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

      const updatedActivation = await activationRepository.rotateActivation(
        activation.id,
        {
          tokenHash,
          encryptedToken,
          expiresAt,
        },
        tx
      );

      let emailDelivery = await emailRepository.findByActivationId(activation.id, tx);

      if (!emailDelivery) {
        emailDelivery = await emailRepository.createEmailDelivery(
          {
            type: "COMPANY_OWNER_ACTIVATION",
            activationId: activation.id,
            recipientEmail: owner.user.email,
            status: "PENDING",
          },
          tx
        );
      } else {
        emailDelivery = await emailRepository.resetForRetry(emailDelivery.id, tx);
      }

      await createOutboxEvent(
        {
          eventType: COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.COMPANY_OWNER_ACTIVATION_EMAIL,
          aggregateId: updatedActivation.id,
          payload: {
            emailDeliveryId: emailDelivery.id,
            activationId: updatedActivation.id,
          },
        },
        tx
      );

      return {
        company: owner.company,
        owner: {
          id: owner.user.id,
          name: owner.user.name,
          email: owner.user.email,
          status: owner.user.status,
        },
        expiresAt,
      };
    },
    {
      isolationLevel: "Serializable",
    }
  );
};

module.exports = {
  createOwnerActivation,
  consumeActivation,
  resendOwnerActivation,
  hashToken,
  buildOwnerActivationUrl,
};
