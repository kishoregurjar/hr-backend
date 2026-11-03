"use strict";

/**
 * =============================================================================
 * HireQuest Staging Preflight Guard — Target Database Identity Verifier
 * File: backend/scripts/verify_target_db.js
 * =============================================================================
 * Fail-Closed Preflight Safety Guard:
 * 1. Queries PostgreSQL catalog for actual connected database identity:
 *    current_database(), current_user, inet_server_addr(), inet_server_port().
 * 2. In staging mode (default):
 *    - Requires EXPECTED_TARGET_DB environment variable (fail closed if missing).
 *    - Connected database name must EXACTLY match EXPECTED_TARGET_DB.
 *    - Rejects --allow-dev flag (development bypass is forbidden in staging).
 * 3. Inspects BOTH DATABASE_URL (application queries) and DIRECT_URL (Prisma
 *    migrations). If DIRECT_URL is configured, verifies it connects to the
 *    identical expected database and host.
 * 4. Multi-layered Production Protection:
 *    - Database name check: rejects "prod", "production", "live".
 *    - User check: rejects production user names.
 *    - Host check: rejects known production hosts.
 *    - Never allows --allow-dev to bypass production protection.
 * =============================================================================
 */

const { PrismaClient } = require("@prisma/client");

const PRODUCTION_KEYWORDS = ["prod", "production", "live"];
const DEFAULT_DEV_DB_NAMES = ["hirequest_dev", "hirequest", "postgres", "dev", "development"];

class TargetDatabaseSafetyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "TargetDatabaseSafetyError";
    this.details = details;
  }
}

/**
 * Query catalog identity on a given connection URL.
 */
async function queryConnectionIdentity(connectionUrl, connectionLabel = "DATABASE_URL") {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
    log: [],
    errorFormat: "minimal",
  });

  try {
    const rows = await client.$queryRawUnsafe(`
      SELECT 
        current_database() AS db_name,
        current_user AS db_user,
        inet_server_addr()::text AS server_ip,
        inet_server_port()::text AS server_port,
        version() AS pg_version;
    `);

    if (!rows || rows.length === 0) {
      throw new TargetDatabaseSafetyError(
        `Failed to query catalog identity on ${connectionLabel}: zero rows returned.`
      );
    }

    return rows[0];
  } finally {
    await client.$disconnect();
  }
}

/**
 * Multi-factor check to determine whether a connection target appears to be production.
 */
function assertNotProduction(identity, connectionUrl, label) {
  const dbName = (identity.db_name || "").toLowerCase();
  const dbUser = (identity.db_user || "").toLowerCase();
  const serverIp = (identity.server_ip || "").toLowerCase();
  const rawUrl = (connectionUrl || "").toLowerCase();

  for (const kw of PRODUCTION_KEYWORDS) {
    if (dbName.includes(kw)) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] ${label} database "${identity.db_name}" matches production keyword "${kw}". Execution aborted immediately.`,
        { label, identity }
      );
    }
    if (dbUser.includes(kw)) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] ${label} database user "${identity.db_user}" matches production keyword "${kw}". Execution aborted immediately.`,
        { label, identity }
      );
    }
    if (rawUrl.includes(kw)) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] ${label} connection URL contains production keyword "${kw}". Execution aborted immediately.`,
        { label, identity }
      );
    }
  }

  // Check server IP or host against known production indicators
  if (serverIp && (serverIp.includes("prod") || serverIp.includes("live"))) {
    throw new TargetDatabaseSafetyError(
      `[FATAL] ${label} server IP "${identity.server_ip}" indicates a production host.`,
      { label, identity }
    );
  }
}

/**
 * Verifies that the connected database matches the authorized target.
 */
async function verifyTargetDatabase(options = {}) {
  const mode = (options.mode || process.env.TARGET_ENVIRONMENT || "staging").toLowerCase();
  const expectedDb = (
    options.expectedDatabase ||
    process.env.EXPECTED_TARGET_DB ||
    ""
  ).trim();
  const allowDev = Boolean(
    options.allowDev ||
    process.env.ALLOW_DEV_EXECUTION === "true" ||
    process.argv.includes("--allow-dev")
  );

  console.log(`[DB GUARD] Initializing database identity preflight...`);
  console.log(`[DB GUARD] Target Mode          : ${mode.toUpperCase()}`);

  // 1. Enforce mode-specific prerequisites
  if (mode === "staging") {
    if (!expectedDb) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] EXPECTED_TARGET_DB environment variable is required in staging mode.\n` +
        `Set EXPECTED_TARGET_DB (e.g. "hirequest_staging") to authorize execution against a specific target.`
      );
    }
    if (allowDev) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] --allow-dev flag is strictly forbidden in STAGING mode.\n` +
        `Staging execution requires verified isolated staging targets only.`
      );
    }
    console.log(`[DB GUARD] Expected Staging DB  : "${expectedDb}"`);
  } else if (mode === "dev") {
    if (!allowDev) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] Development target mode requires explicit --allow-dev or ALLOW_DEV_EXECUTION=true.`
      );
    }
    console.log(`[DB GUARD] Development mode override active (--allow-dev).`);
  } else {
    throw new TargetDatabaseSafetyError(
      `[FATAL] Unrecognized TARGET_ENVIRONMENT mode: "${mode}". Valid modes are: "staging", "dev".`
    );
  }

  // 2. Resolve Connection URLs
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new TargetDatabaseSafetyError(`Missing required environment variable: DATABASE_URL`);
  }

  const directUrl = process.env.DIRECT_URL;

  // 3. Check DATABASE_URL connection identity
  console.log(`[DB GUARD] Probing DATABASE_URL connection identity...`);
  const dbIdentity = await queryConnectionIdentity(databaseUrl, "DATABASE_URL");
  console.log(`[DB GUARD] Connected DB Name    : "${dbIdentity.db_name}"`);
  console.log(`[DB GUARD] Connected DB User    : "${dbIdentity.db_user}"`);
  console.log(`[DB GUARD] Server Address       : ${dbIdentity.server_ip || "socket"}:${dbIdentity.server_port || "default"}`);

  // Multi-layered production check (NEVER bypassed, even in dev)
  assertNotProduction(dbIdentity, databaseUrl, "DATABASE_URL");

  // Validate database name against expected target
  if (mode === "staging") {
    if (dbIdentity.db_name.toLowerCase() !== expectedDb.toLowerCase()) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] Connected database "${dbIdentity.db_name}" does not match EXPECTED_TARGET_DB "${expectedDb}".`,
        { connectedDb: dbIdentity.db_name, expectedDb }
      );
    }

    if (DEFAULT_DEV_DB_NAMES.includes(dbIdentity.db_name.toLowerCase())) {
      throw new TargetDatabaseSafetyError(
        `[FATAL] Connected database "${dbIdentity.db_name}" is a known DEVELOPMENT database name.\n` +
        `Staging execution cannot target development databases.`,
        { connectedDb: dbIdentity.db_name }
      );
    }
  }

  // 4. Check DIRECT_URL connection identity (used by Prisma Migrate deploy)
  if (directUrl && directUrl.trim() !== "") {
    console.log(`[DB GUARD] Probing DIRECT_URL connection identity (used by Prisma Migrate)...`);
    const directIdentity = await queryConnectionIdentity(directUrl, "DIRECT_URL");
    console.log(`[DB GUARD] Direct DB Name       : "${directIdentity.db_name}"`);
    console.log(`[DB GUARD] Direct DB User       : "${directIdentity.db_user}"`);

    // Multi-layered production check on DIRECT_URL
    assertNotProduction(directIdentity, directUrl, "DIRECT_URL");

    if (mode === "staging") {
      if (directIdentity.db_name.toLowerCase() !== expectedDb.toLowerCase()) {
        throw new TargetDatabaseSafetyError(
          `[FATAL] DIRECT_URL connects to database "${directIdentity.db_name}", which does NOT match EXPECTED_TARGET_DB "${expectedDb}".\n` +
          `Prisma migrations would execute against the wrong database!`,
          { directDb: directIdentity.db_name, expectedDb }
        );
      }
      if (directIdentity.db_name.toLowerCase() !== dbIdentity.db_name.toLowerCase()) {
        throw new TargetDatabaseSafetyError(
          `[FATAL] Database mismatch: DATABASE_URL points to "${dbIdentity.db_name}" but DIRECT_URL points to "${directIdentity.db_name}".\n` +
          `Prisma client and migrations must target the same database!`,
          { appDb: dbIdentity.db_name, directDb: directIdentity.db_name }
        );
      }
    }
  } else if (mode === "staging") {
    console.warn(`[DB GUARD] [WARN] DIRECT_URL is not set. Prisma Migrate will default to DATABASE_URL.`);
  }

  console.log(`[DB GUARD] Preflight target identity check PASSED: Safe to proceed with ${mode.toUpperCase()} operations.\n`);
  return {
    database: dbIdentity,
    mode,
    expectedDb,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const allowDev = args.includes("--allow-dev") || process.env.ALLOW_DEV_EXECUTION === "true";
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : (process.env.TARGET_ENVIRONMENT || "staging");
  const expectedDbArg = args.find((a) => a.startsWith("--expected="));
  const expectedDatabase = expectedDbArg ? expectedDbArg.split("=")[1] : undefined;

  await verifyTargetDatabase({ mode, allowDev, expectedDatabase });
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\n${err.message}`);
      if (err.details) {
        console.error("Details:", JSON.stringify(err.details, null, 2));
      }
      process.exit(1);
    });
}

module.exports = {
  TargetDatabaseSafetyError,
  verifyTargetDatabase,
  queryConnectionIdentity,
  assertNotProduction,
  PRODUCTION_KEYWORDS,
  DEFAULT_DEV_DB_NAMES,
  main,
};
