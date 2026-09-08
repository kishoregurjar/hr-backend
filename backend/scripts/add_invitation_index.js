"use strict";

const { prisma } = require("../src/config/prisma");

async function main() {
  console.log("Executing SQL for Partial Unique Index on CompanyInvitation...");
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvitation_companyId_email_pending_key"
    ON "CompanyInvitation" ("companyId", "email")
    WHERE "status" = 'PENDING';
  `);
  console.log("Partial Unique Index created successfully!");
}

main()
  .catch((err) => {
    console.error("Failed to create index:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
