const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('TABLES:', tables.map(t => t.table_name).join(', '));
    
    const columns = await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='AssessmentGame'");
    console.log('ASSESSMENT_GAME_COLUMNS:', columns.map(c => c.column_name).join(', '));
    
    try {
      const migrations = await prisma.$queryRawUnsafe("SELECT * FROM _prisma_migrations");
      console.log('MIGRATIONS_COUNT:', migrations.length);
      console.log('MIGRATIONS:', migrations.map(m => m.migration_name).join(', '));
    } catch (err) {
      console.log('MIGRATIONS_ERROR:', err.message);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
