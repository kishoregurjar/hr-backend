const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Running migration to set backfillComplete = true for existing mailboxes...");
  
  const result = await prisma.userMailbox.updateMany({
    where: {
      lastSyncedAt: {
        not: null
      }
    },
    data: {
      backfillComplete: true
    }
  });

  console.log(`Migration complete. Updated ${result.count} mailboxes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
