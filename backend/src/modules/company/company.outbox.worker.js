"use strict";

const { prisma } = require("../../config/prisma");
const { connectRedis } = require("../../config/redis");

const {
  claimPendingEvents,
  markCompleted,
  markFailed,
  markPermanentlyFailed,
} = require("./company.outbox.repository");

const { COMPANY_OUTBOX_CONSTANTS } = require("./company.outbox.constants");

const {
  COMPANY_INVITATION_EMAIL_STREAM,
  ensureConsumerGroup,
  publishCompanyInvitationEmail,
  publishCompanyOwnerActivationEmail,
} = require("./company.invitation.queue");

const { calculateNextAvailableAt } = require("./company.outbox.service");

const processOutboxEvent = async (event) => {
  const payload =
    typeof event.payload === "string"
      ? JSON.parse(event.payload)
      : event.payload;

  try {
    switch (event.eventType) {
      case COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.COMPANY_INVITATION_EMAIL: {
        await publishCompanyInvitationEmail(payload);
        break;
      }

      case COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.COMPANY_OWNER_ACTIVATION_EMAIL: {
        await publishCompanyOwnerActivationEmail(payload);
        break;
      }

      default:
        throw new Error(`Unsupported outbox event type: ${event.eventType}`);
    }

    await markCompleted(event.id);

    console.info("Outbox event completed", {
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });
  } catch (error) {
    const attempts = Number(event.attempts || 0) + 1;
    const maxAttempts = COMPANY_OUTBOX_CONSTANTS.RETRY.MAX_ATTEMPTS;

    const lastError =
      error instanceof Error ? error.message : String(error);

    if (attempts >= maxAttempts) {
      await markPermanentlyFailed(event.id, {
        attempts,
        lastError,
      });

      console.error("Outbox event permanently failed", {
        eventId: event.id,
        eventType: event.eventType,
        attempts,
        error,
      });

      return;
    }

    const availableAt = calculateNextAvailableAt(attempts);

    await markFailed(event.id, {
      attempts,
      availableAt,
      lastError,
    });

    console.error("Outbox event scheduled for retry", {
      eventId: event.id,
      eventType: event.eventType,
      attempts,
      availableAt,
      error,
    });
  }
};

const startOutboxWorker = async () => {
  await connectRedis();
  await ensureConsumerGroup();

  console.info("Company outbox worker started", {
    stream: COMPANY_INVITATION_EMAIL_STREAM,
  });

  while (true) {
    try {
      const events = await prisma.$transaction(async (tx) => {
        return claimPendingEvents(
          {
            batchSize: COMPANY_OUTBOX_CONSTANTS.PROCESSING.BATCH_SIZE,
            staleLockMinutes:
              COMPANY_OUTBOX_CONSTANTS.PROCESSING.STALE_LOCK_MINUTES,
          },
          tx
        );
      });

      if (!events || !events.length) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            COMPANY_OUTBOX_CONSTANTS.PROCESSING.POLL_INTERVAL_MS
          )
        );
        continue;
      }

      await Promise.allSettled(events.map(processOutboxEvent));
    } catch (error) {
      console.error("Outbox worker error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

if (require.main === module) {
  startOutboxWorker().catch((error) => {
    console.error("Failed to start outbox worker", error);
    process.exit(1);
  });
}

module.exports = {
  startOutboxWorker,
};
