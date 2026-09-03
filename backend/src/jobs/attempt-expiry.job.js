"use strict";

const {
  processExpiredAttempts,
} = require("../workers/attempt-expiry.worker");

const EXPIRY_INTERVAL_MS = 30 * 1000;

let timer = null;
let running = false;

const runAttemptExpiryJob = async () => {
  if (running) {
    return;
  }

  running = true;

  try {
    await processExpiredAttempts();
  } catch (error) {
    console.error({
      type: "ATTEMPT_EXPIRY_JOB_ERROR",
      error: error.message,
    });
  } finally {
    running = false;
  }
};

const startAttemptExpiryJob = () => {
  if (timer) {
    return;
  }

  timer = setInterval(runAttemptExpiryJob, EXPIRY_INTERVAL_MS);

  timer.unref?.();

  return timer;
};

const stopAttemptExpiryJob = () => {
  if (!timer) {
    return;
  }

  clearInterval(timer);

  timer = null;
};

module.exports = {
  startAttemptExpiryJob,
  stopAttemptExpiryJob,
  runAttemptExpiryJob,
};
