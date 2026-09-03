"use strict";

const { prisma, databaseConfig } = require("../config/prisma");

async function runTransaction(callback, options = {}) {
  if (typeof callback !== "function") {
    throw new TypeError("Transaction callback must be a function");
  }

  const timeout = options.timeout ?? databaseConfig.transactionTimeoutMs;
  const maxWait = options.maxWait ?? databaseConfig.transactionMaxWaitMs;

  return prisma.$transaction(
    async (tx) => {
      return callback(tx);
    },
    {
      timeout,
      maxWait,
    }
  );
}

module.exports = {
  runTransaction,
};
