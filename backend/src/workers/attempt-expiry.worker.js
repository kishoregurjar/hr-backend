"use strict";

const { prisma } = require("../config/prisma");
const {
  findExpiredInProgressAttempts,
  countExpiredAttempts,
} = require("../modules/attempt/attempt.repository");
const {
  expireAttempt,
} = require("../modules/attempt/attempt.service");
const attemptMetrics = require("../modules/attempt/attempt.metrics");

const BATCH_SIZE = 100;

let workerState = {
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastSuccessfulAt: null,
  lastErrorAt: null,
};

const getWorkerState = () => ({
  ...workerState,
});

const processExpiredAttempts = async () => {
  const startedAt = process.hrtime.bigint();
  const now = new Date();

  workerState.running = true;
  workerState.lastStartedAt = now;

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const backlog = await countExpiredAttempts({ now }, prisma).catch(() => 0);
    attemptMetrics.setExpiryBacklog(backlog);

    const attempts = await findExpiredInProgressAttempts(
      {
        now,
        limit: BATCH_SIZE,
      },
      prisma
    );

    if (!attempts || attempts.length === 0) {
      workerState.lastCompletedAt = new Date();
      workerState.lastSuccessfulAt = new Date();
      workerState.running = false;

      attemptMetrics.setExpiryBacklog(0);
      return {
        processed: 0,
        skipped: 0,
        failed: 0,
      };
    }

    for (const attempt of attempts) {
      try {
        const result = await expireAttempt({
          attemptId: attempt.id,
        });

        if (result.processed) {
          processed += 1;
          console.info({
            type: "ATTEMPT_EXPIRED",
            attemptId: attempt.id,
          });
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.error({
          type: "ATTEMPT_EXPIRY_PROCESSING_ERROR",
          attemptId: attempt.id,
          error: error.message,
        });
      }
    }

    const remaining = await countExpiredAttempts({ now: new Date() }, prisma).catch(() => 0);
    attemptMetrics.setExpiryBacklog(remaining);

    workerState.lastCompletedAt = new Date();
    workerState.lastSuccessfulAt = new Date();
    workerState.running = false;

    return {
      processed,
      skipped,
      failed,
    };
  } catch (err) {
    workerState.lastErrorAt = new Date();
    workerState.running = false;
    throw err;
  } finally {
    const endedAt = process.hrtime.bigint();
    const durationMs = Number(endedAt - startedAt) / 1_000_000;
    attemptMetrics.recordExpiryWorkerLatency(durationMs);
  }
};

module.exports = {
  processExpiredAttempts,
  getWorkerState,
};
