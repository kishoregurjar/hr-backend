"use strict";

const app = require("./app");
const env = require("./config/env");
const logger = require("./config/logger");
const { disconnectDatabase } = require("./config/prisma");
const { connectRedis, disconnectRedis } = require("./config/redis");

let server;

const startServer = async () => {
  await connectRedis();

  server = app.listen(env.port, () => {
    logger.info(
      `${env.app.name} server is running on port ${env.port}`
    );
  });
};

startServer().catch((error) => {
  logger.fatal(`Server startup failed: ${error.message}`);
  process.exit(1);
});

/**
 * Graceful Shutdown
 */
const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down...`);

  try {
    await disconnectDatabase();
    logger.info("Database disconnected successfully.");

    await disconnectRedis();
    logger.info("Redis disconnected successfully.");

    if (server) {
      server.close(() => {
        logger.info("Server closed successfully.");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  } catch (error) {
    logger.error("Shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.fatal(error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal(reason);

  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});