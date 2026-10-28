const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const mb = await prisma.userMailbox.findFirst({
    where: { email: '523110064@nitkkr.ac.in' }
  });
  console.log(mb);
}

main().finally(() => prisma.$disconnect());
