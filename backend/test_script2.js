const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function showMailbox() {
  const m = await prisma.userMailbox.findFirst({ where: { email: 'vs2917239@gmail.com' } });
  console.log({
    backfillComplete: m.backfillComplete,
    backfillPageToken: m.backfillPageToken,
    lastSyncedAt: m.lastSyncedAt,
    dateRangeSyncEnabled: m.dateRangeSyncEnabled,
    dateRangeSyncFrom: m.dateRangeSyncFrom,
    dateRangeSyncTo: m.dateRangeSyncTo,
    dateRangeLastSyncedAt: m.dateRangeLastSyncedAt,
    lastError: m.lastError
  });
}

showMailbox().finally(() => prisma.$disconnect());
