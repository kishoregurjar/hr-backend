"use strict";

require("./test-env");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: [],
  errorFormat: "minimal",
});

/**
 * Clean only TEST-created data from the shared dev database.
 *
 * Scope: records linked to users with @example.com emails.
 * This prevents FK violations against real production data.
 *
 * All test-factory helpers create users with @example.com emails,
 * so this cleanup catches exactly the test data and nothing else.
 */
async function cleanDatabase() {
  await prisma.$transaction(async (tx) => {
    // 1. Delete email deliveries (child of invitation / activation)
    await tx.emailDelivery.deleteMany();

    // 2. Delete outbox events (no FK to user)
    await tx.outboxEvent.deleteMany();

    // 3. Delete company invitations (child of company)
    await tx.companyInvitation.deleteMany();

    // 4. Delete owner activations for test users only
    await tx.companyOwnerActivation.deleteMany({
      where: {
        user: { email: { endsWith: "@example.com" } },
      },
    });

    // 5. Delete company members created by test users
    await tx.companyMember.deleteMany({
      where: {
        user: { email: { endsWith: "@example.com" } },
      },
    });

    // 6. Delete companies that now have no members (test companies)
    await tx.company.deleteMany({
      where: { members: { none: {} } },
    });

    // 7. Delete test users only — leaves production HR/admin users intact
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
};
