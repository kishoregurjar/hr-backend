"use strict";

const {
  expirePendingInvitations,
} = require("./company.invitation.service");

const {
  resetStaleProcessingDeliveries,
} = require("./company.email.repository");

/*
 * How often the cleanup loop runs.
 */
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/*
 * Deliveries stuck in PROCESSING for longer than this are reset to PENDING
 * so that the email worker can pick them up again.
 */
const STALE_DELIVERY_MINUTES = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let isRunning = false;

const runCleanupCycle = async () => {
  /*
   * 1. Expire pending invitations that have passed their expiry time.
   *    updateMany is used with status:'PENDING' to avoid racing with
   *    a concurrent accept request.
   */
  const expiredCount = await expirePendingInvitations();
  if (expiredCount > 0) {
    console.info("[INVITATION_CLEANUP] expired invitations", {
      count: expiredCount,
    });
  }

  /*
   * 2. Reset email deliveries stuck in PROCESSING (worker crash recovery).
   */
  const resetResult = await resetStaleProcessingDeliveries({
    staleMinutes: STALE_DELIVERY_MINUTES,
  });
  if (resetResult.count > 0) {
    console.info("[INVITATION_CLEANUP] reset stale email deliveries", {
      count: resetResult.count,
    });
  }
};

const startInvitationCleanupWorker = async () => {
  if (isRunning) {
    return;
  }

  isRunning = true;

  console.info("[INVITATION_CLEANUP] worker started", {
    intervalMs: INTERVAL_MS,
    staleDeliveryMinutes: STALE_DELIVERY_MINUTES,
  });

  while (isRunning) {
    try {
      await runCleanupCycle();
    } catch (error) {
      console.error("[INVITATION_CLEANUP_ERROR]", error);
    }

    await sleep(INTERVAL_MS);
  }
};

const stopInvitationCleanupWorker = () => {
  isRunning = false;
};

/*
 * Graceful shutdown.
 */
const handleShutdown = (signal) => {
  console.info(`[INVITATION_CLEANUP] received ${signal}. Stopping...`);
  stopInvitationCleanupWorker();
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

/*
 * Allow this file to be run directly as a standalone worker process:
 *   node src/modules/company/company.invitation.cleanup.worker.js
 */
if (require.main === module) {
  startInvitationCleanupWorker().catch((error) => {
    console.error("[INVITATION_CLEANUP] failed to start", error);
    process.exit(1);
  });
}

module.exports = {
  startInvitationCleanupWorker,
  stopInvitationCleanupWorker,
};
