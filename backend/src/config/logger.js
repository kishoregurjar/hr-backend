const path = require("path");
const fs = require("fs");
const pino = require("pino");
const env = require("./env");

/**
 * ==========================================================
 * Enterprise Logger Configuration
 * ==========================================================
 * Multi-target Pino logger streaming to:
 * 1. Console (pino-pretty in development)
 * 2. logs/combined.log (All HTTP & application info/debug logs)
 * 3. logs/error.log (Error & crash logs only)
 * ==========================================================
 */

const logDirectory = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const combinedLogPath = path.join(logDirectory, "combined.log");
const errorLogPath = path.join(logDirectory, "error.log");

const targets = [
  {
    level: env.logger.level || "info",
    target: "pino/file",
    options: { destination: combinedLogPath, mkdir: true },
  },
  {
    level: "error",
    target: "pino/file",
    options: { destination: errorLogPath, mkdir: true },
  },
];

if (env.nodeEnv === "development") {
  targets.push({
    level: env.logger.level || "info",
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  });
}

const transport = pino.transport({ targets });

const logger = pino(
  {
    level: env.logger.level || "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

module.exports = logger;