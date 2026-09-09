"use strict";

const isRetryablePrismaTransactionError = (error) => {
  return error?.code === "P2034";
};

const runSerializableTransaction = async (
  prisma,
  callback,
  { maxRetries = 3 } = {}
) => {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      attempt += 1;
      if (!isRetryablePrismaTransactionError(error) || attempt >= maxRetries) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50 * Math.pow(2, attempt - 1));
      });
    }
  }

  throw new Error("TRANSACTION_RETRY_EXHAUSTED");
};

module.exports = {
  runSerializableTransaction,
};
