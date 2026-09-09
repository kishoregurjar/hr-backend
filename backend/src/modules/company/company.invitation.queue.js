"use strict";

const { redisClient } = require("../../config/redis");

const COMPANY_INVITATION_EMAIL_STREAM =
  "hirequest:queue:company-invitation-email";

const COMPANY_INVITATION_EMAIL_GROUP =
  "company-invitation-email-workers";

const COMPANY_INVITATION_EMAIL_CONSUMER = `worker-${process.pid}`;

const COMPANY_INVITATION_EMAIL_MAX_RETRIES = 5;

const enqueueCompanyInvitationEmail = async ({
  invitationId,
  email,
  companyName,
  inviterName,
  role,
  invitationUrl,
  expiresAt,
}) => {
  const messageId = await redisClient.xAdd(
    COMPANY_INVITATION_EMAIL_STREAM,
    "*",
    {
      invitationId,
      email,
      companyName,
      inviterName: inviterName || "",
      role,
      invitationUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      attempts: "0",
    }
  );

  return messageId;
};

const publishCompanyInvitationEmail = async (payload) => {
  return redisClient.xAdd(
    COMPANY_INVITATION_EMAIL_STREAM,
    "*",
    {
      eventType: "COMPANY_INVITATION_EMAIL",
      invitationId: String(payload.invitationId),
      email: String(payload.email),
      companyName: String(payload.companyName),
      inviterName: String(payload.inviterName || ""),
      role: String(payload.role),
      invitationUrl: String(payload.invitationUrl),
      expiresAt: String(payload.expiresAt),
    }
  );
};

const publishCompanyOwnerActivationEmail = async (payload) => {
  return redisClient.xAdd(
    COMPANY_INVITATION_EMAIL_STREAM,
    "*",
    {
      eventType: "COMPANY_OWNER_ACTIVATION_EMAIL",
      activationId: String(payload.activationId),
      recipientEmail: String(payload.recipientEmail || payload.email),
      ownerName: String(payload.ownerName || ""),
      companyName: String(payload.companyName || ""),
      activationUrl: String(payload.activationUrl || ""),
      expiresAt: String(payload.expiresAt || ""),
    }
  );
};

const ensureConsumerGroup = async () => {
  try {
    await redisClient.xGroupCreate(
      COMPANY_INVITATION_EMAIL_STREAM,
      COMPANY_INVITATION_EMAIL_GROUP,
      "0",
      {
        MKSTREAM: true,
      }
    );
  } catch (error) {
    /*
     * BUSYGROUP means the group already exists.
     * This is expected during application restart.
     */
    if (!String(error?.message || "").includes("BUSYGROUP")) {
      throw error;
    }
  }
};

module.exports = {
  COMPANY_INVITATION_EMAIL_STREAM,
  COMPANY_INVITATION_EMAIL_GROUP,
  COMPANY_INVITATION_EMAIL_CONSUMER,
  COMPANY_INVITATION_EMAIL_MAX_RETRIES,

  enqueueCompanyInvitationEmail,
  publishCompanyInvitationEmail,
  publishCompanyOwnerActivationEmail,
  ensureConsumerGroup,
};
