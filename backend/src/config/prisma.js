const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
});

async function connectDatabase() {
  await prisma.$connect();
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

async function runTransaction(callback, options = {}) {
  const defaultOptions = { maxWait: 30000, timeout: 30000 };
  return prisma.$transaction(
    async (tx) => {
      return callback(tx);
    },
    { ...defaultOptions, ...options }
  );
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  runTransaction,
};