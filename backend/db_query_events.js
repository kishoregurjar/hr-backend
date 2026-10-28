const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.inboundEmailEvent.findMany({
    where: { 
      recipientEmail: '523110064@nitkkr.ac.in',
      createdAt: { gte: new Date('2026-10-06T00:00:00.000Z') }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(events, null, 2));
}

main().finally(() => prisma.$disconnect());
