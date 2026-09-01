const express = require("express");
const cors = require("cors");

const corsOptions = require("./config/cors");

const securityMiddleware = require("./middleware/security.middleware");
const requestId = require("./middleware/requestId.middleware");
const requestLogger = require("./middleware/requestLogger.middleware");
const { globalRateLimiter } = require("./middleware/rateLimit.middleware");
const notFound = require("./middleware/notFound.middleware");
const errorHandler = require("./middleware/error.middleware");


const routes = require("./routes");

const app = express();

/**
 * Enable Trust Proxy for Reverse Proxies (Cloudflare/Nginx)
 */
app.set("trust proxy", true);

/**
 * CORS (Applied first so preflight OPTIONS requests are answered immediately)
 */
app.use(cors(corsOptions));

/**
 * Request ID
 */
app.use(requestId);

/**
 * Request Logger
 */
app.use(requestLogger);

/**
 * Global Rate Limiter
 */

app.use(globalRateLimiter);

/**
 * Security
 */
securityMiddleware(app);

/**
 * Routes
 */
app.use("/api/v1", routes);

/**
 * 404 Handler
 */
app.use(notFound);

/**
 * Global Error Handler
 */
app.use(errorHandler);



module.exports = app;