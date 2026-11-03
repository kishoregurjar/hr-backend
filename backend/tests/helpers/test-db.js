"use strict";

require("./test-env");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: [],
  errorFormat: "minimal",
});

/**
 * Assert test database identity before executing destructive test cleanup.
 * Prevents accidental execution against production or unverified targets.
 */
async function assertTestDatabaseIdentity() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT current_database() AS db_name, current_user AS db_user;
  `);

  if (!rows || rows.length === 0) {
    throw new Error("[DB CLEANUP ERROR] Unable to query target database identity.");
  }

  const dbName = (rows[0].db_name || "").toLowerCase();
  if (dbName.includes("prod") || dbName.includes("production") || dbName.includes("live")) {
    throw new Error(`[FATAL] Refusing to run cleanDatabase() against PRODUCTION database: "${rows[0].db_name}"`);
  }

  return rows[0];
}

/**
 * Clean ONLY test-created data from the verified test database.
 *
 * Scope: records linked to users with @example.com emails and test companies.
 *
 * Safe Dependency Ordering:
 * 1. EmailDelivery (scoped to test recipients)
 * 2. CompanyInvitation (scoped to test emails)
 * 3. CompanyOwnerActivation (scoped to test users)
 * 4. OutboxEvent (scoped to TEST_ event types and test company aggregates)
 * 5. CompanyMember (scoped to test users)
 * 6. Company (scoped to test companies with zero remaining members)
 * 7. User (scoped to test users)
 *
 * IMMUTABLE AUDIT TABLE CONTRACT:
 * AssessmentQuarantineLog and QuarantineResolutionEvent have database triggers
 * (trg_prevent_quarantine_log_mutation) that forbid UPDATE, DELETE, and TRUNCATE.
 * They are NEVER deleted here. Tests that evaluate quarantine must either:
 *   a) Run inside an uncommitted/rolled-back transaction; or
 *   b) Append resolution events (the official audit trail); or
 *   c) Restore the staging database from a snapshot.
 */
async function cleanDatabase() {
  await assertTestDatabaseIdentity();

  await prisma.$transaction(async (tx) => {
    // 1. Delete email deliveries for test recipients only
    await tx.emailDelivery.deleteMany({
      where: {
        recipientEmail: { endsWith: "@example.com" },
      },
    });

    // 2. Delete company invitations for test emails only
    await tx.companyInvitation.deleteMany({
      where: {
        email: { endsWith: "@example.com" },
      },
    });

    // 3. Delete owner activations for test users only
    await tx.companyOwnerActivation.deleteMany({
      where: {
        user: { email: { endsWith: "@example.com" } },
      },
    });

    // 4. Find test company IDs before deleting members
    const testCompanies = await tx.company.findMany({
      where: {
        members: {
          some: {
            user: { email: { endsWith: "@example.com" } },
          },
        },
      },
      select: { id: true },
    });
    const testCompanyIds = testCompanies.map((c) => c.id);

    // 5. Delete outbox events scoped to test types and test company aggregates
    await tx.outboxEvent.deleteMany({
      where: {
        OR: [
          { eventType: { startsWith: "TEST_" } },
          ...(testCompanyIds.length > 0 ? [{ aggregateId: { in: testCompanyIds } }] : []),
        ],
      },
    });

    // 6. Delete company members created by test users
    await tx.companyMember.deleteMany({
      where: {
        user: { email: { endsWith: "@example.com" } },
      },
    });

    // 7. Delete test companies that now have no members
    await tx.company.deleteMany({
      where: {
        members: { none: {} },
      },
    });

    // 8. Delete test users only
    await tx.user.deleteMany({
      where: { email: { endsWith: "@example.com" } },
    });
  });
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  cleanDatabase,
  disconnectDatabase,
  assertTestDatabaseIdentity,
};

