const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/prisma");

/**
 * Default Enterprise Transaction Options
 */
const DEFAULT_TRANSACTION_OPTIONS = {
  timeout: 10000,
  maxWait: 5000,
  isolationLevel: Prisma.TransactionIsolationLevel
    ? Prisma.TransactionIsolationLevel.ReadCommitted
    : "ReadCommitted",
};

/**
 * Standardized Enterprise Transaction Wrapper
 * @param {Function} callback - Transaction execution callback function accepting tx
 * @param {Object} options - Configurable timeout, maxWait, and isolationLevel overrides
 */
async function runTransaction(callback, options = {}) {
  const transactionOptions = {
    ...DEFAULT_TRANSACTION_OPTIONS,
    ...options,
  };

  return prisma.$transaction(async (tx) => {
    return callback(tx);
  }, transactionOptions);
}

module.exports = {
  runTransaction,
  DEFAULT_TRANSACTION_OPTIONS,
};
