const env = require("./env");

const rawOrigins = env.cors.origin ? env.cors.origin.split(",").map((o) => o.trim().replace(/\/$/, "")) : [];

const defaultDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server or non-browser tools (e.g. Postman, cURL)
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/$/, "");

    // Check configured origins
    if (rawOrigins.includes(cleanOrigin) || rawOrigins.includes("*")) {
      return callback(null, true);
    }

    // In development, allow localhost, 127.0.0.1, and dev tunnel URLs
    if (env.nodeEnv !== "production") {
      if (
        defaultDevOrigins.includes(cleanOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin) ||
        cleanOrigin.endsWith(".ngrok-free.app") ||
        cleanOrigin.endsWith(".ngrok.io") ||
        cleanOrigin.endsWith(".loca.lt")
      ) {
        return callback(null, true);
      }
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: ["Content-Disposition", "X-Request-Id"],
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;