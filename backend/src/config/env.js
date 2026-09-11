const dotenv = require("dotenv");

dotenv.config();

/*
 * These variables are required in ALL environments.
 */
const requiredEnvVariables = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "CLIENT_URL",
  "REDIS_URL",
];

/*
 * These are required in production only.
 * In development a warning is printed but the server still starts.
 */
const productionOnlyVariables = [
  "BREVO_SMTP_HOST",
  "BREVO_SMTP_PORT",
  "BREVO_SMTP_USER",
  "BREVO_SMTP_PASSWORD",
  "MAIL_FROM_EMAIL",
  "OWNER_ACTIVATION_ENCRYPTION_KEY",
];

const missing = requiredEnvVariables.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `[ENV] Missing required environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";
const missingProd = productionOnlyVariables.filter((key) => !process.env[key]);

if (missingProd.length > 0) {
  if (isProduction) {
    console.error(
      `[ENV] Missing production environment variables: ${missingProd.join(", ")}`
    );
    process.exit(1);
  } else {
    console.warn(
      `[ENV] Warning: missing variables (required in production): ${missingProd.join(", ")}`
    );
  }
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV,
  port: Number(process.env.PORT),

  app: {
    name: process.env.APP_NAME || "HireQuest",
    url: process.env.APP_URL || `http://localhost:${process.env.PORT}`,
    environment: process.env.NODE_ENV,
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "7d",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    refreshTokenTTL: Number(process.env.REFRESH_TOKEN_TTL_MS) || 30 * 24 * 60 * 60 * 1000,
  },

  cookie: {
    secret: process.env.COOKIE_SECRET,
    accessMaxAge: Number(process.env.ACCESS_COOKIE_MAX_AGE) || 7 * 24 * 60 * 60 * 1000,
    refreshMaxAge: Number(process.env.REFRESH_COOKIE_MAX_AGE) || 30 * 24 * 60 * 60 * 1000,
  },

  auth: {
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
  },

  security: {
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,
    ownerActivationEncryptionKey: process.env.OWNER_ACTIVATION_ENCRYPTION_KEY,
  },

  smtp: {
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT),
    user: process.env.BREVO_SMTP_USER,
    password: process.env.BREVO_SMTP_PASSWORD,
    fromEmail: process.env.MAIL_FROM_EMAIL,
    fromName: process.env.MAIL_FROM_NAME || "HireQuest",
  },

  cors: {
    origin: process.env.CLIENT_URL,
    allowedOrigins: (process.env.CORS_ORIGINS || process.env.CLIENT_URL || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  },

  frontend: {
    url: (
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      process.env.PUBLIC_FRONTEND_URL ||
      "http://localhost:3000"
    ).replace(/\/+$/, ""),
  },

  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

module.exports = env;