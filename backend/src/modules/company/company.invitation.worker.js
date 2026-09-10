"use strict";

const env = require("../../config/env");
const { redisClient, connectRedis } = require("../../config/redis");
const { sendEmail, verifyEmailTransport } = require("../../utils/email");
const {
  createCompanyInvitationEmail,
} = require("./company.invitation.email.template");
const {
  COMPANY_INVITATION_EMAIL_STREAM,
  COMPANY_INVITATION_EMAIL_GROUP,
  COMPANY_INVITATION_EMAIL_CONSUMER,
  ensureConsumerGroup,
} = require("./company.invitation.queue");

const {
  buildOwnerWelcomeEmail,
} = require("../super-admin/super-admin.owner-welcome.email.template");

const {
  findEmailDeliveryByInvitationId,
  findEmailDeliveryByActivationId,
  markEmailProcessing,
  markEmailSent,
  markEmailFailed,
} = require("./company.email.repository");

const CLAIM_IDLE_TIME_MS = 10 * 60 * 1000;

const { prisma } = require("../../config/prisma");

const processInvitationEmail = async (message) => {
  const {
    invitationId,
    email,
    companyName,
    inviterName,
    role,
    invitationUrl: fallbackUrl,
    expiresAt,
  } = message;

  const delivery = await findEmailDeliveryByInvitationId(invitationId);

  /*
   * If delivery record doesn't exist,
   * don't send an email.
   */
  if (!delivery) {
    console.error("Email delivery record not found", {
      invitationId,
    });

    return {
      success: false,
      permanentFailure: true,
    };
  }

  /*
   * Idempotency protection.
   */
  if (delivery.status === "SENT") {
    console.info("Invitation email already sent", {
      invitationId,
    });

    return {
      success: true,
      alreadySent: true,
    };
  }

  /*
   * DB State Guard: Ensure invitation is still PENDING and NOT expired/revoked.
   */
  const invitation = await prisma.companyInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      encryptedToken: true,
    },
  });

  if (
    !invitation ||
    invitation.status !== "PENDING" ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    console.warn("Invitation email skipped (invitation is not PENDING or has expired/revoked)", {
      invitationId,
      status: invitation?.status,
    });
    return {
      success: false,
      permanentFailure: true,
    };
  }

  let finalInvitationUrl = fallbackUrl;
  if (invitation.encryptedToken) {
    try {
      const rawToken = decryptToken(invitation.encryptedToken);
      const frontendUrl = env.frontend.url;
      finalInvitationUrl = `${frontendUrl}/accept-invitation?invitation=${invitation.id}&token=${encodeURIComponent(
        rawToken
      )}`;
    } catch (e) {
      console.warn("Failed to decrypt token for invitation email, using fallback URL", e);
    }
  }

  const attempts = delivery.attempts + 1;
  await markEmailProcessing(delivery.id, attempts);

  try {
    const html = createCompanyInvitationEmail({
      companyName,
      inviterName,
      role,
      invitationUrl: finalInvitationUrl,
      expiresAt,
    });

    await sendEmail({
      to: email,
      subject: `You're invited to join ${companyName}`,
      html,
    });

    await markEmailSent(delivery.id);

    console.info("Invitation email sent", {
      invitationId,
      email,
      attempts,
    });

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await markEmailFailed(delivery.id, errorMessage);

    console.error("Company invitation email failed", {
      invitationId,
      email,
      attempts,
      error: errorMessage,
    });

    throw error;
  }
};

const ownerActivationRepository = require("../super-admin/super-admin.owner-activation.repository");
const { decryptToken } = require("../super-admin/super-admin.owner-activation.crypto");

const buildOwnerActivationUrl = (rawToken) => {
  const frontendUrl = env.frontend.url;
  const url = new URL("/activate-owner", frontendUrl);
  url.searchParams.set("token", rawToken);
  return url.toString();
};

const processOwnerActivationEmail = async (message) => {
  const { activationId } = message;

  const delivery = await findEmailDeliveryByActivationId(activationId);

  if (!delivery) {
    console.error("Owner activation email delivery record not found", {
      activationId,
    });

    return {
      success: false,
      permanentFailure: true,
    };
  }

  if (delivery.status === "SENT") {
    console.info("Owner activation email already sent", {
      activationId,
    });

    return {
      success: true,
      alreadySent: true,
    };
  }

  const activation = await ownerActivationRepository.findByActivationId(activationId);

  if (!activation || !activation.user) {
    console.error("Owner activation DB record not found", { activationId });
    return { success: false, permanentFailure: true };
  }

  if (activation.status !== "PENDING") {
    console.warn(`Activation status is not PENDING (${activation.status})`, { activationId });
    return { success: false, permanentFailure: true };
  }

  if (activation.expiresAt.getTime() <= Date.now()) {
    console.warn("Owner activation link expired", { activationId });
    return { success: false, permanentFailure: true };
  }

  const attempts = delivery.attempts + 1;
  await markEmailProcessing(delivery.id, attempts);

  try {
    const rawToken = decryptToken(activation.encryptedToken);
    const activationUrl = buildOwnerActivationUrl(rawToken);
    const companyName = activation.user.companyMembers?.[0]?.company?.name || message.companyName || "Your Company";
    const ownerName = activation.user.name || message.ownerName || "Company Owner";

    const { subject, html } = buildOwnerWelcomeEmail({
      ownerName,
      companyName,
      activationUrl,
      expiresAt: activation.expiresAt,
    });

    await sendEmail({
      to: delivery.recipientEmail,
      subject,
      html,
    });

    await markEmailSent(delivery.id);

    console.info("Owner welcome activation email sent", {
      activationId,
      email: delivery.recipientEmail,
      attempts,
    });

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await markEmailFailed(delivery.id, errorMessage);

    console.error("Owner activation email failed", {
      activationId,
      email: delivery.recipientEmail,
      attempts,
      error: errorMessage,
    });

    throw error;
  }
};

const reclaimPendingMessages = async () => {
  try {
    const result = await redisClient.xAutoClaim(
      COMPANY_INVITATION_EMAIL_STREAM,
      COMPANY_INVITATION_EMAIL_GROUP,
      COMPANY_INVITATION_EMAIL_CONSUMER,
      CLAIM_IDLE_TIME_MS,
      "0-0",
      {
        COUNT: 20,
      }
    );

    return result?.messages || [];
  } catch (error) {
    console.error("Failed to reclaim pending email messages", error);
    return [];
  }
};

const acknowledgeMessage = async (messageId) => {
  await redisClient.xAck(
    COMPANY_INVITATION_EMAIL_STREAM,
    COMPANY_INVITATION_EMAIL_GROUP,
    messageId
  );
};

const handleMessage = async (message) => {
  if (!message || !message.id || !message.message) {
    return;
  }

  const { id, message: data } = message;

  try {
    let result;
    if (
      data.eventType === "COMPANY_OWNER_ACTIVATION_EMAIL" ||
      data.activationId
    ) {
      result = await processOwnerActivationEmail(data);
    } else {
      result = await processInvitationEmail(data);
    }

    if (result.success || result.permanentFailure) {
      await acknowledgeMessage(id);
    }
  } catch (error) {
    console.error("Email message processing failed", {
      messageId: id,
      error,
    });
  }
};

let isShuttingDown = false;

const startCompanyInvitationWorker = async () => {
  await connectRedis();
  await ensureConsumerGroup();
  await verifyEmailTransport();

  console.info("Company invitation email worker started", {
    consumer: COMPANY_INVITATION_EMAIL_CONSUMER,
  });

  while (!isShuttingDown) {
    try {
      /*
       * First recover abandoned messages from crashed workers.
       */
      const pendingMessages = await reclaimPendingMessages();

      for (const message of pendingMessages) {
        if (isShuttingDown) break;
        await handleMessage({
          id: message.id,
          message: message.message,
        });
      }

      if (isShuttingDown) break;

      /*
       * Then process new incoming messages.
       */
      const result = await redisClient.xReadGroup(
        COMPANY_INVITATION_EMAIL_GROUP,
        COMPANY_INVITATION_EMAIL_CONSUMER,
        [
          {
            key: COMPANY_INVITATION_EMAIL_STREAM,
            id: ">",
          },
        ],
        {
          COUNT: 10,
          BLOCK: 5000,
        }
      );

      if (!result) {
        continue;
      }

      for (const stream of result) {
        for (const message of stream.messages) {
          if (isShuttingDown) break;
          await handleMessage(message);
        }
      }
    } catch (error) {
      if (isShuttingDown) break;
      console.error("Company invitation worker error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

const shutdownWorker = async (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.info(
    `Received ${signal}. Shutting down invitation email worker...`
  );

  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  } catch (error) {
    console.error("Invitation email worker shutdown failed", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdownWorker("SIGTERM"));
process.on("SIGINT", () => shutdownWorker("SIGINT"));

if (require.main === module) {
  startCompanyInvitationWorker().catch((error) => {
    console.error("Failed to start invitation worker", error);
    process.exit(1);
  });
}

module.exports = {
  startCompanyInvitationWorker,
};
