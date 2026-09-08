const env = require("./env");

/**
 * ==========================================================
 * Enterprise CORS Configuration
 * ==========================================================
 * Environment-aware CORS policy handling localhost, ngrok tunnels,
 * and production client domain whitelisting.
 * ==========================================================
 */

// Parse comma-separated CLIENT_URL values from env
const allowedOrigins = (env.cors.origin || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // 1. Allow non-browser requests (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    // 2. In development mode, allow localhost and any ngrok tunnel origins
    if (
      env.nodeEnv === "development" &&
      (origin.includes("localhost") || origin.includes("ngrok") || origin.includes("127.0.0.1"))
    ) {
      return callback(null, true);
    }

    // 3. Match whitelisted production origins
    if (allowedOrigins.includes(origin)) {
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

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "ngrok-skip-browser-warning",
    "X-Company-Id",
    "X-Request-Id",
  ],

  exposedHeaders: ["Set-Cookie", "X-Request-Id"],
};

module.exports = corsOptions;