"use strict";

async function pingDatabase(prisma) {
  if (!prisma) {
    throw new TypeError("Prisma client is required");
  }

  await prisma.$queryRaw`SELECT 1`;
  return true;
}

async function getDatabaseTime(prisma) {
  if (!prisma) {
    throw new TypeError("Prisma client is required");
  }

  const result = await prisma.$queryRaw`SELECT NOW() AS now`;
  return result[0]?.now ?? null;
}

module.exports = {
  pingDatabase,
  getDatabaseTime,
};
