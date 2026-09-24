"use strict";

const { prisma } = require("../config/prisma");
const { getAllGameMetadata } = require("../modules/game/game.registry");

async function seedCompanyGameConfigs() {
  console.log("🌱 Starting Company Game Config Backfill Seed...");

  try {
    const companies = await prisma.company.findMany();
    console.log(`Found ${companies.length} companies.`);

    const registryGames = getAllGameMetadata();

    // Ensure all registered games exist in the Game table
    const games = [];
    for (const meta of registryGames) {
      let dbGame = await prisma.game.findFirst({
        where: {
          OR: [{ id: meta.id }, { code: meta.code }],
        },
      });

      if (!dbGame) {
        dbGame = await prisma.game.create({
          data: {
            id: meta.id,
            code: meta.code,
            name: meta.name,
            description: meta.description,
            isActive: true,
          },
        });
      }
      games.push(dbGame);
    }

    console.log(`Ensured ${games.length} games in database.`);

    let createdCount = 0;
    for (const company of companies) {
      for (const game of games) {
        await prisma.companyGameConfig.upsert({
          where: {
            companyId_gameId: {
              companyId: company.id,
              gameId: game.id,
            },
          },
          create: {
            companyId: company.id,
            gameId: game.id,
            status: "Active",
            difficulty: "EASY",
            duration: 10,
            passingScore: 70,
          },
          update: {}, // Don't overwrite if already exists
        });
        createdCount++;
      }
    }

    console.log(`✅ Backfill completed successfully! Seeded ${createdCount} company-game config records.`);
  } catch (error) {
    console.error("❌ Seed migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedCompanyGameConfigs();
}

module.exports = { seedCompanyGameConfigs };
