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

const MAX_RECORDED_OPERATIONS = 25;

function recordPrismaMetric(durationMs, model, action) {
  try {
    const ctx = getRequestContext();
    if (!ctx || !ctx.prisma) return;
    const dur = Math.max(0, durationMs || 0);
    ctx.prisma.count += 1;
    ctx.prisma.cumulativeDurationMs += dur;

    if (Array.isArray(ctx.prisma.operations) && ctx.prisma.operations.length < MAX_RECORDED_OPERATIONS) {
      ctx.prisma.operations.push({
        model: typeof model === "string" ? model : (typeof action === "string" && action.startsWith("$") ? "raw" : "unknown"),
        action: typeof action === "string" ? action : "query",
        durationMs: Number(dur.toFixed(2)),
      });
    }
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
                recordPrismaMetric(performance.now() - start, "raw", prop);
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
                    recordPrismaMetric(performance.now() - start, prop, modelProp);
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
  MAX_RECORDED_OPERATIONS,
};
