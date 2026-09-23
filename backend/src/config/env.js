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
const hasSmtpHost = Boolean(process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST);
const hasSmtpPort = Boolean(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT);
const hasSmtpUser = Boolean(process.env.BREVO_SMTP_USER || process.env.SMTP_USER);
const hasSmtpPassword = Boolean(process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS);
const hasMailFrom = Boolean(process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM);
const hasEncryptionKey = Boolean(process.env.OWNER_ACTIVATION_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET);

const missing = requiredEnvVariables.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `[ENV] Missing required environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";
const missingProd = [];
if (!hasSmtpHost) missingProd.push("BREVO_SMTP_HOST / SMTP_HOST");
if (!hasSmtpPort) missingProd.push("BREVO_SMTP_PORT / SMTP_PORT");
if (!hasSmtpUser) missingProd.push("BREVO_SMTP_USER / SMTP_USER");
if (!hasSmtpPassword) missingProd.push("BREVO_SMTP_PASSWORD / SMTP_PASS");
if (!hasMailFrom) missingProd.push("MAIL_FROM_EMAIL / EMAIL_FROM");
if (!hasEncryptionKey) missingProd.push("OWNER_ACTIVATION_ENCRYPTION_KEY / JWT_ACCESS_SECRET");

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
    ownerActivationEncryptionKey:
      process.env.OWNER_ACTIVATION_ENCRYPTION_KEY ||
      process.env.JWT_ACCESS_SECRET ||
      "hirequest_owner_activation_32char_key_2026",
  },

  smtp: {
    host: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 587),
    user: process.env.BREVO_SMTP_USER || process.env.SMTP_USER,
    password: process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS,
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || "rshivamsingh378@gmail.com",
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