"use strict";

require("dotenv").config();
const tls = require("tls");
const { URL } = require("url");

/**
 * Script to test Redis Connection & Auth via TLS
 */
const rawUrl = process.env.REDIS_URL || "";
if (!rawUrl) {
  console.error("❌ REDIS_URL is not set in .env file!");
  process.exit(1);
}

try {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname;
  const port = parseInt(parsed.port, 10) || 6379;
  const username = parsed.username || "default";
  const password = parsed.password;

  console.log(`Connecting to Redis host: ${host}:${port}...`);

  const client = tls.connect(port, host, { servername: host }, () => {
    console.log("✅ TLS Connection Established!");
    if (password) {
      client.write(`AUTH ${username} ${password}\r\nPING\r\n`);
    } else {
      client.write("PING\r\n");
    }
  });

  client.on("data", (data) => {
    const response = data.toString();
    console.log("Redis Server Response:\n", response.trim());
    if (response.includes("PONG") || response.includes("OK")) {
      console.log("🎉 Redis Authentication & Ping SUCCESSFUL!");
    }
    client.end();
  });

  client.on("error", (err) => {
    console.error("❌ Redis Connection Failed:", err.message);
  });
} catch (err) {
  console.error("❌ Invalid REDIS_URL format:", err.message);
}
