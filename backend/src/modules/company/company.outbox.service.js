"use strict";

const { COMPANY_OUTBOX_CONSTANTS } = require("./company.outbox.constants");

const calculateRetryDelay = (attempts) => {
  const { BASE_DELAY_SECONDS, MAX_DELAY_SECONDS } =
    COMPANY_OUTBOX_CONSTANTS.RETRY;

  const exponentialDelay =
    BASE_DELAY_SECONDS * Math.pow(2, Math.max(attempts - 1, 0));

  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_SECONDS);

  const jitter = Math.floor(Math.random() * 10);

  return cappedDelay + jitter;
};

const calculateNextAvailableAt = (attempts) => {
  const delaySeconds = calculateRetryDelay(attempts);

  return new Date(Date.now() + delaySeconds * 1000);
};

module.exports = {
  calculateRetryDelay,
  calculateNextAvailableAt,
};
