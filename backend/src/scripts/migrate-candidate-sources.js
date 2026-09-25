"use strict";

const { prisma } = require("../config/prisma");

function extractEmail(str) {
  if (!str) return null;
  const match = str.match(/<([^>]+)>/);
  if (match && match[1]) return match[1].trim().toLowerCase();
  if (typeof str === "string" && str.includes("@")) return str.trim().toLowerCase();
  return null;
}

async function migrateCandidateSources() {
  console.log("Starting Candidate Sources DB Migration...");

  try {
    // 1. Find candidates associated with ResumeProcessing or InboundEmailEvent
    const resumeProfiles = await prisma.resumeProcessing.findMany({
      select: { candidateId: true, extractedData: true },
    });

    const emailCandidateIds = new Set();
    const emailAddresses = new Set();

    resumeProfiles.forEach((r) => {
      if (r.candidateId) emailCandidateIds.add(r.candidateId);
      const rawEmail = typeof r.extractedData === "object" ? r.extractedData?.email : null;
      const parsedEmail = extractEmail(rawEmail);
      if (parsedEmail) emailAddresses.add(parsedEmail);
    });

    const inboundEvents = await prisma.inboundEmailEvent.findMany({
      select: { senderEmail: true, recipientEmail: true },
    });

    inboundEvents.forEach((evt) => {
      const parsedSender = extractEmail(evt.senderEmail);
      if (parsedSender) emailAddresses.add(parsedSender);
    });

    // 2. Fetch all candidates to process safely in JS without Prisma JSON filter errors
    const allCandidates = await prisma.candidateProfile.findMany({
      select: { id: true, email: true, metadata: true },
    });

    const emailMatchIds = [];
    const manualMatchIds = [];

    allCandidates.forEach((cand) => {
      const candEmail = cand.email ? cand.email.trim().toLowerCase() : "";
      const isEmailSource =
        emailCandidateIds.has(cand.id) || (candEmail && emailAddresses.has(candEmail));

      if (isEmailSource) {
        emailMatchIds.push(cand.id);
      } else {
        manualMatchIds.push(cand.id);
      }
    });

    let emailUpdatedCount = 0;
    if (emailMatchIds.length > 0) {
      const res = await prisma.candidateProfile.updateMany({
        where: { id: { in: emailMatchIds } },
        data: {
          metadata: { source: "EMAIL_EXTRACTION", inbound: true },
        },
      });
      emailUpdatedCount = res.count;
    }

    let manualUpdatedCount = 0;
    if (manualMatchIds.length > 0) {
      const res = await prisma.candidateProfile.updateMany({
        where: { id: { in: manualMatchIds } },
        data: {
          metadata: { source: "MANUAL" },
        },
      });
      manualUpdatedCount = res.count;
    }

    console.log(`Updated ${emailUpdatedCount} Email Extraction candidates.`);
    console.log(`Updated ${manualUpdatedCount} Manual candidates.`);
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateCandidateSources();

