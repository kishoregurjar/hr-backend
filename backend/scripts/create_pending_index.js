"use strict";

const { prisma } = require("../src/config/prisma");

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvitation_pending_unique"
    ON "CompanyInvitation" ("companyId", "email")
    WHERE "status" = 'PENDING';
  `);
  console.log("Index CompanyInvitation_pending_unique created successfully!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
