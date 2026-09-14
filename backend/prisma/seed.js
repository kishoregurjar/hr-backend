"use strict";

require("../src/config/env");
const { prisma } = require("../src/config/prisma");
const gameService = require("../src/modules/game/game.service");

async function main() {
  console.log("Synchronizing Game Registry...");
  const count = await gameService.syncGameRegistry();
  console.log(`Game registry synchronized successfully: ${count} games.`);
}

main()
  .catch((error) => {
    console.error("Game registry seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
