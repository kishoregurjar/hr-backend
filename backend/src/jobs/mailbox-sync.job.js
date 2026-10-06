"use strict";

const { processMailboxSync } = require("../workers/mailbox-sync.worker");

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

let timer = null;
let running = false;

const runMailboxSyncJob = async () => {
  if (running) {
    return;
  }

  running = true;

  try {
    await processMailboxSync();
  } catch (error) {
    console.error({
      type: "MAILBOX_SYNC_JOB_ERROR",
      error: error.message,
    });
  } finally {
    running = false;
  }
};

const startMailboxSyncJob = () => {
  if (timer) {
    return;
  }

  timer = setInterval(runMailboxSyncJob, SYNC_INTERVAL_MS);
  timer.unref?.();

  return timer;
};

const stopMailboxSyncJob = () => {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
};

module.exports = {
  startMailboxSyncJob,
  stopMailboxSyncJob,
  runMailboxSyncJob,
};
