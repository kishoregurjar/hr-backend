"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

/**
 * ==========================================================
 * Request-Scoped Latency Metrics Context
 * ==========================================================
 * Provides request-isolated performance metrics tracking
 * using Node.js AsyncLocalStorage.
 * ==========================================================
 */
const metricsStorage = new AsyncLocalStorage();

const IS_METRICS_WRAPPED = Symbol("IS_METRICS_WRAPPED");

function getRequestContext() {
  try {
    return metricsStorage.getStore() || null;
  } catch (_) {
    return null;
  }
}

function recordPrismaMetric(durationMs) {
  try {
    const ctx = getRequestContext();
    if (!ctx || !ctx.prisma) return;
    ctx.prisma.count += 1;
    ctx.prisma.cumulativeDurationMs += Math.max(0, durationMs || 0);
  } catch (_) {
    // Fail-safe: metrics recording must never break business logic
  }
}

function recordRedisMetric(durationMs) {
  try {
    const ctx = getRequestContext();
    if (!ctx || !ctx.redis) return;
    ctx.redis.count += 1;
    ctx.redis.durationMs += Math.max(0, durationMs || 0);
  } catch (_) {
    // Fail-safe
  }
}

function recordStageMetric(stageName, durationMs) {
  try {
    const ctx = getRequestContext();
    if (!ctx || !ctx.stages || !stageName) return;
    ctx.stages[stageName] = Math.max(0, durationMs || 0);
  } catch (_) {
    // Fail-safe
  }
}

function recordTransactionMetric(durationMs) {
  try {
    const ctx = getRequestContext();
    if (!ctx || !ctx.transaction) return;
    ctx.transaction.durationMs += Math.max(0, durationMs || 0);
  } catch (_) {
    // Fail-safe
  }
}

/**
 * Transparent proxy wrapper for Prisma Client & Transaction Client (tx)
 * Automatically times model queries and raw database calls without mutating client internals.
 */
function wrapClientForMetrics(client) {
  if (!client || typeof client !== "object" || client[IS_METRICS_WRAPPED]) {
    return client;
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === IS_METRICS_WRAPPED) return true;
      const orig = Reflect.get(target, prop, receiver);

      if (typeof prop === "string" && prop.startsWith("$")) {
        if (typeof orig === "function" && prop !== "$transaction") {
          return async function (...args) {
            const start = performance.now();
            try {
              return await orig.apply(this, args);
            } finally {
              try {
                recordPrismaMetric(performance.now() - start);
              } catch (_) {}
            }
          };
        }
        return orig;
      }

      if (orig && typeof orig === "object" && typeof prop === "string" && !prop.startsWith("_")) {
        return new Proxy(orig, {
          get(modelTarget, modelProp, modelReceiver) {
            const modelMethod = Reflect.get(modelTarget, modelProp, modelReceiver);
            if (typeof modelMethod === "function") {
              return async function (...args) {
                const start = performance.now();
                try {
                  return await modelMethod.apply(this, args);
                } finally {
                  try {
                    recordPrismaMetric(performance.now() - start);
                  } catch (_) {}
                }
              };
            }
            return modelMethod;
          },
          set(modelTarget, modelProp, value, modelReceiver) {
            return Reflect.set(modelTarget, modelProp, value, modelReceiver);
          },
        });
      }

      return orig;
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
  });
}

module.exports = {
  metricsStorage,
  getRequestContext,
  recordPrismaMetric,
  recordRedisMetric,
  recordStageMetric,
  recordTransactionMetric,
  wrapClientForMetrics,
  IS_METRICS_WRAPPED,
};
