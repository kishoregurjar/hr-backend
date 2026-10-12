"use strict";

require("dotenv").config();
const { createClient } = require("redis");

const { recordRedisMetric } = require("./metrics-context");

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is required.");
}

const redisClient = createClient({
  url: redisUrl,
});

if (redisClient && typeof redisClient.sendCommand === "function") {
  const originalSendCommand = redisClient.sendCommand.bind(redisClient);
  redisClient.sendCommand = async function (...args) {
    const start = performance.now();
    try {
      return await originalSendCommand(...args);
    } finally {
      recordRedisMetric(performance.now() - start);
    }
  };
}

redisClient.on("error", (error) => {
  console.error({
    service: "redis",
    message: error.message,
  });
});

redisClient.on("connect", () => {
  console.log("Redis connecting...");
});

redisClient.on("ready", () => {
  console.log("Redis ready.");
});

redisClient.on("reconnecting", () => {
  console.log("Redis reconnecting...");
});

const connectRedis = async () => {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();
};

const disconnectRedis = async () => {
  if (!redisClient.isOpen) {
    return;
  }

  await redisClient.quit();
};

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
