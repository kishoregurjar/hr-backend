"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const hpp = require("hpp");

const corsOptions = require("./config/cors");
const requestIdMiddleware = require("./middleware/requestId.middleware");
const requestLogger = require("./middleware/requestLogger.middleware");
const notFoundMiddleware = require("./middleware/not-found.middleware");
const errorMiddleware = require("./middleware/error.middleware");

const { createRateLimiter } = require("./middleware/rate-limit.middleware");
const { RATE_LIMIT_POLICIES } = require("./config/rate-limit");

const routes = require("./routes");

const app = express();

/**
 * Configure Express Trust Proxy according to production reverse proxy topology
 * Prevents forged X-Forwarded-For IP spoofing attacks.
 * Defaults to 1 proxy hop if TRUST_PROXY is omitted.
 */
const getTrustProxyConfig = () => {
  const envVal = process.env.TRUST_PROXY;
  if (envVal === undefined || envVal === null || envVal === "") return 1;
  if (envVal === "true") return true;
  if (envVal === "false") return false;
  if (!isNaN(Number(envVal))) return Number(envVal);
  return envVal;
};

app.set("trust proxy", getTrustProxyConfig());

/**
 * 1. Request ID (MUST BE FIRST FOR LOGGING & TRACING)
 */
app.use(requestIdMiddleware);

/**
 * 2. Request Body Parser
 */
app.use(
  express.json({
    limit: "1mb",
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);
app.use(cookieParser());

/**
 * 3. CORS Policy
 */
app.use(cors(corsOptions));

/**
 * 4. Helmet Security Headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/**
 * 5. Parameter Pollution & Compression
 */
app.use(hpp());
app.use(compression());

/**
 * 6. Request Logging
 */
app.use(requestLogger);

/**
 * 7. Global Rate Limiter
 */
app.use(
  createRateLimiter({
    namespace: "global",
    ...RATE_LIMIT_POLICIES.GLOBAL,
    keyGenerator: (req) => req.ip,
  })
);

/**
 * 8. Domain API Routes (/api/v1)
 */
app.use("/api/v1", routes);

/**
 * 9. Catch-All Unknown Routes Handler (404)
 */
app.use(notFoundMiddleware);

/**
 * 10. Central Error Middleware (ALWAYS LAST - Express 4-arity error handler)
 */
app.use(errorMiddleware);

module.exports = app;