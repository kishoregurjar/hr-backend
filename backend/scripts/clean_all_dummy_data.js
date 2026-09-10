"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function cleanAllDummyData() {
  console.info("[CleanData] Starting database cleanup of test/dummy data...");

  await prisma.$transaction(async (tx) => {
    // 1. Delete Email Deliveries
    const deliveries = await tx.emailDelivery.deleteMany();
    console.info(`[CleanData] Deleted ${deliveries.count} EmailDelivery records.`);

    // 2. Delete Outbox Events
    const outbox = await tx.outboxEvent.deleteMany();
    console.info(`[CleanData] Deleted ${outbox.count} OutboxEvent records.`);

    // 3. Delete Company Invitations
    const invitations = await tx.companyInvitation.deleteMany();
    console.info(`[CleanData] Deleted ${invitations.count} CompanyInvitation records.`);

    // 4. Delete Company Owner Activations
    const activations = await tx.companyOwnerActivation.deleteMany();
    console.info(`[CleanData] Deleted ${activations.count} CompanyOwnerActivation records.`);

    // 5. Delete Candidate Answers, Attempt Questions, Attempts
    await tx.candidateAnswer.deleteMany();
    await tx.attemptQuestion.deleteMany();
    await tx.candidateAttempt.deleteMany();
    await tx.invitation.deleteMany();
    console.info("[CleanData] Cleared candidate attempts & invitations.");

    // 6. Delete Assessment Questions & Assessments
    await tx.assessmentQuestion.deleteMany();
    await tx.assessment.deleteMany();
    console.info("[CleanData] Cleared assessments.");

    // 7. Delete Job Applications & Jobs
    await tx.jobApplication.deleteMany();
    await tx.job.deleteMany();
    console.info("[CleanData] Cleared jobs.");

    // 8. Delete Resume Processing, Mailbox, Audit Logs
    await tx.resumeProcessing.deleteMany();
    await tx.userMailbox.deleteMany();
    await tx.auditLog.deleteMany();

    // 9. Delete Candidate Profiles
    await tx.candidateProfile.deleteMany();
    console.info("[CleanData] Cleared candidate profiles.");

    // 10. Delete Company Members (except super admin if any)
    await tx.companyMember.deleteMany({
      where: {
        user: { email: { not: "admin@hirequest.com" } },
      },
    });

    // 11. Delete Companies
    const companies = await tx.company.deleteMany();
    console.info(`[CleanData] Deleted ${companies.count} Company records.`);

    // 12. Delete Users (except Super Admin: admin@hirequest.com)
    const users = await tx.user.deleteMany({
      where: {
        email: { not: "admin@hirequest.com" },
      },
    });
    console.info(`[CleanData] Deleted ${users.count} User records (Super Admin preserved).`);
  });

  console.info("[CleanData] Database cleanup completed successfully!");
}

cleanAllDummyData()
  .catch((err) => {
    console.error("[CleanData] Cleanup error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
