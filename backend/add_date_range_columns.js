const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "public"."UserMailbox"
    ADD COLUMN IF NOT EXISTS "dateRangeSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "dateRangeSyncFrom" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dateRangeSyncTo" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dateRangeLastSyncedAt" TIMESTAMP(3);
  `);

  console.log("UserMailbox date-range columns added successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });