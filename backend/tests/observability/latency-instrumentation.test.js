"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  metricsStorage,
  getRequestContext,
  recordPrismaMetric,
  recordRedisMetric,
  recordStageMetric,
  recordTransactionMetric,
  wrapClientForMetrics,
} = require("../../src/config/metrics-context");

const {
  diagnosticsMiddleware,
  getNormalizedRoute,
  isTargetedRoute,
} = require("../../src/middleware/diagnostics.middleware");

const logger = require("../../src/config/logger");
const { prisma, runTransaction } = require("../../src/config/prisma");
const { redisClient } = require("../../src/config/redis");

describe("Latency Instrumentation & Observability Suite", () => {
  let origLoggerInfo;
  let loggedInfoCalls = [];

  beforeEach(() => {
    origLoggerInfo = logger.info;
    loggedInfoCalls = [];
    logger.info = (...args) => {
      loggedInfoCalls.push(args[0]);
    };
  });

  afterEach(() => {
    logger.info = origLoggerInfo;
  });

  it("1. Request-context isolation under concurrent requests", async () => {
    const runSimulatedRequest = async (id, prismaOps, redisOps) => {
      const ctx = {
        requestId: id,
        route: "POST /api/v1/attempts/save-answer",
        prisma: { count: 0, cumulativeDurationMs: 0 },
        redis: { count: 0, durationMs: 0 },
        stages: {},
      };

      return new Promise((resolve) => {
        metricsStorage.run(ctx, async () => {
          // Staggered asynchronous operations
          for (let i = 0; i < prismaOps; i++) {
            await new Promise((r) => setTimeout(r, 2));
            recordPrismaMetric(10);
          }
          for (let j = 0; j < redisOps; j++) {
            await new Promise((r) => setTimeout(r, 1));
            recordRedisMetric(5);
          }

          const current = getRequestContext();
          resolve({
            id: current.requestId,
            prismaCount: current.prisma.count,
            prismaDuration: current.prisma.cumulativeDurationMs,
            redisCount: current.redis.count,
            redisDuration: current.redis.durationMs,
          });
        });
      });
    };

    const [resA, resB, resC] = await Promise.all([
      runSimulatedRequest("req_A", 5, 2),
      runSimulatedRequest("req_B", 2, 0),
      runSimulatedRequest("req_C", 8, 1),
    ]);

    assert.equal(resA.id, "req_A");
    assert.equal(resA.prismaCount, 5);
    assert.equal(resA.prismaDuration, 50);
    assert.equal(resA.redisCount, 2);
    assert.equal(resA.redisDuration, 10);

    assert.equal(resB.id, "req_B");
    assert.equal(resB.prismaCount, 2);
    assert.equal(resB.prismaDuration, 20);
    assert.equal(resB.redisCount, 0);
    assert.equal(resB.redisDuration, 0);

    assert.equal(resC.id, "req_C");
    assert.equal(resC.prismaCount, 8);
    assert.equal(resC.prismaDuration, 80);
    assert.equal(resC.redisCount, 1);
    assert.equal(resC.redisDuration, 5);
  });

  it("2. Prisma timing for normal and transaction-client queries", async () => {
    const ctx = {
      requestId: "req_prisma_tx",
      route: "POST /api/v1/attempts/submit",
      prisma: { count: 0, cumulativeDurationMs: 0 },
      redis: { count: 0, durationMs: 0 },
      transaction: { durationMs: 0 },
      stages: {},
    };

    await new Promise((resolve) => {
      metricsStorage.run(ctx, async () => {
        // Mock a standalone query
        const mockModel = {
          findFirst: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { id: "att_1" };
          },
        };
        const wrappedModel = wrapClientForMetrics({ candidateAttempt: mockModel });
        await wrappedModel.candidateAttempt.findFirst();

        assert.equal(ctx.prisma.count, 1);
        assert.ok(ctx.prisma.cumulativeDurationMs >= 4);

        // Mock a transaction client query and transaction wrapper
        const mockTx = {
          $queryRaw: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return [{ id: "att_1" }];
          },
          candidateAnswer: {
            update: async () => {
              await new Promise((r) => setTimeout(r, 5));
              return { id: "ans_1" };
            },
          },
        };

        const wrappedTx = wrapClientForMetrics(mockTx);
        const startTx = performance.now();
        await wrappedTx.$queryRaw`SELECT 1`;
        await wrappedTx.candidateAnswer.update();
        recordTransactionMetric(performance.now() - startTx);

        assert.equal(ctx.prisma.count, 3);
        assert.ok(ctx.prisma.cumulativeDurationMs >= 12);
        assert.ok(ctx.transaction.durationMs >= 9);

        resolve();
      });
    });
  });

  it("3. Redis timing and instrumentation failure handling", async () => {
    const ctx = {
      requestId: "req_redis_test",
      route: "POST /api/v1/attempts/save-answer",
      prisma: { count: 0, cumulativeDurationMs: 0 },
      redis: { count: 0, durationMs: 0 },
      stages: {},
    };

    await new Promise((resolve) => {
      metricsStorage.run(ctx, async () => {
        // Test redis recording
        recordRedisMetric(15.5);
        assert.equal(ctx.redis.count, 1);
        assert.equal(ctx.redis.durationMs, 15.5);

        // Test robustness against invalid/corrupt values
        assert.doesNotThrow(() => recordRedisMetric(null));
        assert.doesNotThrow(() => recordRedisMetric(undefined));
        assert.doesNotThrow(() => recordRedisMetric(-10));
        assert.doesNotThrow(() => recordPrismaMetric(null));
        assert.doesNotThrow(() => recordStageMetric(null, null));
        assert.doesNotThrow(() => recordTransactionMetric(null));

        resolve();
      });
    });
  });

  it("4. Sensitive-data exclusion from emitted logs & normalized routes", async () => {
    let responseFinishHandler = null;

    const req = {
      method: "POST",
      baseUrl: "/api/v1",
      path: "/attempts/save-answer",
      url: "/api/v1/attempts/save-answer?token=raw_secret_token_123&otp=999999",
      requestId: "req_safe_test_id",
      headers: {
        authorization: "Bearer secret_session_token_xyz",
        cookie: "session=sensitive_cookie_value",
      },
      body: {
        token: "raw_secret_token_123",
        otp: "999999",
        answerText: "Sensitive candidate subjective essay",
        candidateId: "cand_personal_id_8888",
        email: "candidate.private@example.com",
      },
    };

    const res = new EventEmitter();
    res.statusCode = 200;

    diagnosticsMiddleware(req, res, () => {
      // Simulate operations inside request pipeline
      recordPrismaMetric(120.4);
      recordRedisMetric(3.2);
      recordStageMetric("sessionAuthMs", 45.1);
      recordStageMetric("saveCandidateAnswerMs", 75.3);
    });

    // Fire response finish
    res.emit("finish");

    assert.equal(loggedInfoCalls.length, 1);
    const logPayload = loggedInfoCalls[0];
    const stringifiedLog = JSON.stringify(logPayload);

    // 1. Verify expected metric fields
    assert.equal(logPayload.event, "REQUEST_DIAGNOSTIC_METRICS");
    assert.equal(logPayload.requestId, "req_safe_test_id");
    assert.equal(logPayload.route, "POST /api/v1/attempts/save-answer");
    assert.equal(logPayload.statusCode, 200);
    assert.equal(logPayload.prisma.count, 1);
    assert.equal(logPayload.prisma.cumulativeDurationMs, 120.4);
    assert.equal(logPayload.redis.count, 1);
    assert.equal(logPayload.redis.durationMs, 3.2);
    assert.equal(logPayload.stages.sessionAuthMs, 45.1);
    assert.equal(logPayload.stages.saveCandidateAnswerMs, 75.3);

    // 2. Strict Privacy Proof: Zero sensitive substrings in emitted log
    assert.ok(!stringifiedLog.includes("raw_secret_token_123"), "Token must not be logged");
    assert.ok(!stringifiedLog.includes("999999"), "OTP must not be logged");
    assert.ok(!stringifiedLog.includes("Sensitive candidate subjective essay"), "Answer text must not be logged");
    assert.ok(!stringifiedLog.includes("cand_personal_id_8888"), "Candidate ID must not be logged");
    assert.ok(!stringifiedLog.includes("candidate.private@example.com"), "Email must not be logged");
    assert.ok(!stringifiedLog.includes("secret_session_token_xyz"), "Authorization token must not be logged");
    assert.ok(!stringifiedLog.includes("sensitive_cookie_value"), "Cookie must not be logged");
  });

  it("5. Overlapping operations do not produce misleading negative or inferred residual timings", async () => {
    const ctx = {
      requestId: "req_overlap_test",
      route: "POST /api/v1/attempts/submit",
      startTime: performance.now(),
      prisma: { count: 0, cumulativeDurationMs: 0 },
      redis: { count: 0, durationMs: 0 },
      transaction: { durationMs: 0 },
      stages: {},
    };

    await new Promise((resolve) => {
      metricsStorage.run(ctx, async () => {
        const wallClockStart = performance.now();

        // 5 queries running concurrently via Promise.all (e.g. evaluating 5 answers)
        await Promise.all([
          (async () => {
            await new Promise((r) => setTimeout(r, 20));
            recordPrismaMetric(20);
          })(),
          (async () => {
            await new Promise((r) => setTimeout(r, 20));
            recordPrismaMetric(20);
          })(),
          (async () => {
            await new Promise((r) => setTimeout(r, 20));
            recordPrismaMetric(20);
          })(),
          (async () => {
            await new Promise((r) => setTimeout(r, 20));
            recordPrismaMetric(20);
          })(),
          (async () => {
            await new Promise((r) => setTimeout(r, 20));
            recordPrismaMetric(20);
          })(),
        ]);

        const wallClockDuration = performance.now() - wallClockStart;
        recordStageMetric("submitCandidateAttemptMs", wallClockDuration);

        // Cumulative sum of queries is ~100ms
        assert.equal(ctx.prisma.count, 5);
        assert.ok(ctx.prisma.cumulativeDurationMs >= 95);

        // Actual wall clock is ~20-40ms (concurrent)
        assert.ok(wallClockDuration < ctx.prisma.cumulativeDurationMs);
        assert.ok(wallClockDuration > 0);

        // Proves that cumulative duration is clearly differentiated from stage duration
        resolve();
      });
    });
  });

  it("6. Non-targeted routes produce zero diagnostic logs (bounded logging)", () => {
    const nonTargetedReq = {
      method: "GET",
      baseUrl: "/api/v1",
      path: "/health",
      url: "/api/v1/health",
      requestId: "req_health_check",
    };

    const res = new EventEmitter();
    res.statusCode = 200;

    diagnosticsMiddleware(nonTargetedReq, res, () => {});
    res.emit("finish");

    assert.equal(loggedInfoCalls.length, 0, "No diagnostic log should be emitted for non-targeted routes");
  });

  it("7. Route normalization replaces dynamic attemptId and paths cleanly", () => {
    const route1 = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1",
      path: "/attempts/123e4567-e89b-12d3-a456-426614174000/submit",
    });
    assert.equal(route1, "POST /api/v1/attempts/:attemptId/submit");

    const route2 = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1",
      path: "/attempts/save-answer",
    });
    assert.equal(route2, "POST /api/v1/attempts/save-answer");

    const route3 = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1",
      path: "/assessment-attempts/att_ck123456789/submit",
    });
    assert.equal(route3, "POST /api/v1/assessment-attempts/:attemptId/submit");

    const routeOtpSend = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1/attempts",
      path: "/candidate/send-otp",
    });
    assert.equal(routeOtpSend, "POST /api/v1/attempts/candidate/send-otp");

    const routeOtpVerify = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1/attempts",
      path: "/candidate/verify-otp",
    });
    assert.equal(routeOtpVerify, "POST /api/v1/attempts/candidate/verify-otp");

    const routeStartByToken = getNormalizedRoute({
      method: "POST",
      baseUrl: "/api/v1/attempts",
      path: "/start-by-token",
    });
    assert.equal(routeStartByToken, "POST /api/v1/attempts/start-by-token");
  });

  it("8. Captures exact model and action in operations array with privacy guarantee", async () => {
    const ctx = {
      requestId: "req_ops_detail",
      route: "POST /api/v1/attempts/start-by-token",
      prisma: { count: 0, cumulativeDurationMs: 0, operations: [] },
      redis: { count: 0, durationMs: 0 },
      stages: {},
    };

    await new Promise((resolve) => {
      metricsStorage.run(ctx, async () => {
        const mockClient = {
          $queryRaw: async () => [{ id: "1" }],
          invitation: {
            findUnique: async () => ({ id: "inv_1", secret: "super_secret_token" }),
          },
          candidateAttempt: {
            create: async () => ({ id: "att_1" }),
          },
        };

        const wrapped = wrapClientForMetrics(mockClient);
        await wrapped.$queryRaw`SELECT * FROM "Invitation" WHERE token = 'super_secret_token'`;
        await wrapped.invitation.findUnique({ where: { id: "inv_1", token: "super_secret_token" } });
        await wrapped.candidateAttempt.create({ data: { candidateId: "secret_cand_1" } });

        assert.equal(ctx.prisma.count, 3);
        assert.equal(ctx.prisma.operations.length, 3);

        const [op1, op2, op3] = ctx.prisma.operations;
        assert.equal(op1.model, "raw");
        assert.equal(op1.action, "$queryRaw");
        assert.ok(typeof op1.durationMs === "number" && op1.durationMs >= 0);

        assert.equal(op2.model, "invitation");
        assert.equal(op2.action, "findUnique");
        assert.ok(typeof op2.durationMs === "number" && op2.durationMs >= 0);

        assert.equal(op3.model, "candidateAttempt");
        assert.equal(op3.action, "create");
        assert.ok(typeof op3.durationMs === "number" && op3.durationMs >= 0);

        // Strict Privacy Verification: Operations record contains NO arguments, parameters, or sensitive strings
        const stringifiedOps = JSON.stringify(ctx.prisma.operations);
        assert.ok(!stringifiedOps.includes("super_secret_token"), "Query parameters must not be captured");
        assert.ok(!stringifiedOps.includes("secret_cand_1"), "Data payloads must not be captured");
        assert.ok(!stringifiedOps.includes("SELECT * FROM"), "SQL text must not be captured");

        resolve();
      });
    });
  });

  it("9. Limits recorded operations to 25 per request while count and cumulative duration track all", async () => {
    const ctx = {
      requestId: "req_cap_test",
      route: "POST /api/v1/attempts/submit",
      prisma: { count: 0, cumulativeDurationMs: 0, operations: [] },
      redis: { count: 0, durationMs: 0 },
      stages: {},
    };

    await new Promise((resolve) => {
      metricsStorage.run(ctx, async () => {
        // Execute 30 operations
        for (let i = 1; i <= 30; i++) {
          recordPrismaMetric(2, "candidateAnswer", "update");
        }

        assert.equal(ctx.prisma.count, 30, "Total count must reflect all 30 operations");
        assert.equal(ctx.prisma.cumulativeDurationMs, 60, "Cumulative duration must sum all 30 operations");
        assert.equal(ctx.prisma.operations.length, 25, "Operations array must be strictly capped at 25");

        // Verify structure of stored items
        assert.equal(ctx.prisma.operations[0].model, "candidateAnswer");
        assert.equal(ctx.prisma.operations[0].action, "update");
        assert.equal(ctx.prisma.operations[0].durationMs, 2);

        resolve();
      });
    });
  });

  it("10. Diagnostic targeting includes all 5 critical candidate attempt routes", () => {
    const targetedRoutes = [
      { method: "POST", url: "/api/v1/attempts/save-answer" },
      { method: "POST", url: "/api/v1/attempts/submit" },
      { method: "POST", url: "/api/v1/attempts/candidate/send-otp" },
      { method: "POST", url: "/api/v1/attempts/candidate/verify-otp" },
      { method: "POST", url: "/api/v1/attempts/start-by-token" },
    ];

    for (const route of targetedRoutes) {
      assert.ok(
        isTargetedRoute({ method: route.method, path: route.url, url: route.url }),
        `Route ${route.method} ${route.url} must be targeted for diagnostics`
      );
    }

    const untargetedRoutes = [
      { method: "GET", url: "/api/v1/attempts/candidate/send-otp" },
      { method: "GET", url: "/api/v1/health" },
      { method: "POST", url: "/api/v1/users/login" },
    ];

    for (const route of untargetedRoutes) {
      assert.ok(
        !isTargetedRoute({ method: route.method, path: route.url, url: route.url }),
        `Route ${route.method} ${route.url} must not be targeted`
      );
    }
  });
});
