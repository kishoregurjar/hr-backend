"use strict";

const { prisma } = require("../config/prisma");
const {
  findExpiredInProgressAttempts,
} = require("../modules/attempt/attempt.repository");
const {
  expireAttempt,
} = require("../modules/attempt/attempt.service");

const BATCH_SIZE = 100;

const processExpiredAttempts = async () => {
  const now = new Date();

  const attempts = await findExpiredInProgressAttempts(
    {
      now,
      limit: BATCH_SIZE,
    },
    prisma
  );

  if (!attempts || attempts.length === 0) {
    return {
      processed: 0,
      skipped: 0,
    };
  }

  let processed = 0;
  let skipped = 0;

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
      console.error({
        type: "ATTEMPT_EXPIRY_PROCESSING_ERROR",
        attemptId: attempt.id,
        error: error.message,
      });
    }
  }

  return {
    processed,
    skipped,
  };
};

module.exports = {
  processExpiredAttempts,
};
