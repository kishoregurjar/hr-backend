"use strict";

const { redisClient } = require("../config/redis");

const RATE_LIMIT_SCRIPT = `
local current = redis.call(
  "INCR",
  KEYS[1]
)

if current == 1 then
  redis.call(
    "EXPIRE",
    KEYS[1],
    ARGV[1]
  )
end

local ttl = redis.call(
  "TTL",
  KEYS[1]
)

return {
  current,
  ttl
}
`;

/**
 * In-memory fallback tracking for environments where Redis client is disconnected/testing
 */
const inMemoryStore = new Map();

const consumeMemoryRateLimit = ({ key, windowSeconds, maxRequests }) => {
  const now = Date.now();
  let record = inMemoryStore.get(key);

  if (!record || record.expiresAt <= now) {
    record = { current: 1, expiresAt: now + windowSeconds * 1000 };
  } else {
    record.current += 1;
  }

  inMemoryStore.set(key, record);

  const ttl = Math.ceil((record.expiresAt - now) / 1000);
  const current = record.current;

  return {
    allowed: current <= maxRequests,
    current,
    remaining: Math.max(maxRequests - current, 0),
    retryAfter: ttl > 0 ? ttl : windowSeconds,
  };
};

/**
 * Atomic Redis Rate Limiter via Lua Scripting
 */
const consumeRateLimit = async ({ key, windowSeconds, maxRequests }) => {
  if (!redisClient || !redisClient.isOpen) {
    return consumeMemoryRateLimit({ key, windowSeconds, maxRequests });
  }

  const result = await redisClient.eval(RATE_LIMIT_SCRIPT, {
    keys: [key],
    arguments: [String(windowSeconds)],
  });

  const current = Number(result[0]);
  const ttl = Number(result[1]);

  return {
    allowed: current <= maxRequests,
    current,
    remaining: Math.max(maxRequests - current, 0),
    retryAfter: ttl > 0 ? ttl : windowSeconds,
  };
};

module.exports = {
  consumeRateLimit,
};
