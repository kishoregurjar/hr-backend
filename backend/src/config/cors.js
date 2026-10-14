const env = require("./env");

/**
 * ==========================================================
 * Enterprise CORS Configuration
 * ==========================================================
 * Environment-aware CORS policy handling localhost, ngrok tunnels,
 * and production client domain whitelisting.
 * ==========================================================
 */

// Parse comma-separated CLIENT_URL / CORS_ORIGINS values strictly from environment variables
const rawAllowedOrigins = [
  ...(env.cors.allowedOrigins || []),
  ...(env.cors.origin ? [env.cors.origin] : []),
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.CORS_ORIGINS,
]
  .filter(Boolean)
  .flatMap((url) => String(url).split(","))
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set(rawAllowedOrigins));

const corsOptions = {
  origin: function (origin, callback) {
    // 1. Allow non-browser requests (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, "");

    // 2. In development mode, allow localhost and any ngrok tunnel origins
    if (
      env.nodeEnv === "development" &&
      (cleanOrigin.includes("localhost") || cleanOrigin.includes("ngrok") || cleanOrigin.includes("127.0.0.1"))
    ) {
      return callback(null, true);
    }

    // 3. Match whitelisted production origins strictly from environment variables
    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    /*
     * Silently reject disallowed origins.
     *
     * Do NOT pass an Error — that would trigger
     * Express error middleware and return HTTP 500.
     * callback(null, false) causes the browser to
     * receive a clean CORS block with no server error.
     */
    return callback(null, false);
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "ngrok-skip-browser-warning",
    "X-Company-Id",
    "x-company-id",
    "X-Request-Id",
    "Cache-Control",
  ],

  exposedHeaders: ["Set-Cookie", "X-Request-Id"],
  optionsSuccessStatus: 204,
};

module.exports = corsOptions;