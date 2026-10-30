"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function runBackup() {
  const backupDir = "F:\\HireQuest_Local_Backup_20261030";
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tables = [
    "Company",
    "Assessment",
    "Invitation",
    "CandidateAttempt",
    "UserMailbox",
    "User",
    "CandidateProfile",
    "Question",
    "ProctoringEvent"
  ];

  console.log("[BACKUP] Starting pre-migration logical data snapshot...");
  const dump = {
    createdAt: new Date().toISOString(),
    environment: "Supabase PostgreSQL (AWS Mumbai)",
    tables: {}
  };

  for (const table of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}";`);
      dump.tables[table] = rows;
      console.log(`[BACKUP] Table "${table}": successfully dumped ${rows.length} records.`);
    } catch (err) {
      console.warn(`[BACKUP] Warning: table "${table}" could not be dumped: ${err.message}`);
    }
  }

  const outPath = path.join(backupDir, "supabase_pre_migration_dump.json");
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), "utf-8");
  const stats = fs.statSync(outPath);
  console.log(`[BACKUP] Snapshot saved successfully to ${outPath} (${stats.size} bytes).`);
}

runBackup()
  .catch((err) => {
    console.error("[BACKUP] Fatal error during snapshot:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

