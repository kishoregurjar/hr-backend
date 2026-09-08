"use strict";

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
  findEmailDeliveryByInvitationId,
  markEmailProcessing,
  markEmailSent,
  markEmailFailed,
} = require("./company.email.repository");

const CLAIM_IDLE_TIME_MS = 10 * 60 * 1000;

const processInvitationEmail = async (message) => {
  const {
    invitationId,
    email,
    companyName,
    inviterName,
    role,
    invitationUrl,
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

  const attempts = delivery.attempts + 1;
  await markEmailProcessing(delivery.id, attempts);

  try {
    const html = createCompanyInvitationEmail({
      companyName,
      inviterName,
      role,
      invitationUrl,
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
    const result = await processInvitationEmail(data);

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
