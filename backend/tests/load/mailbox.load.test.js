"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { google } = require("googleapis");
const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const resumeService = require("../../src/modules/resume/resume.service");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");

// Load a valid sample PDF once for synthetic fixtures
const samplePdfPath = path.resolve(__dirname, "../../node_modules/pdf-parse/test/data/01-valid.pdf");
const samplePdfBase = fs.readFileSync(samplePdfPath);

/**
 * Creates a unique valid PDF buffer by appending a unique comment to the valid PDF.
 * This preserves authentic PDF syntax and technical skills (C++, JavaScript, Python, Node.js, etc.)
 * while generating a unique SHA-256 file hash.
 */
function createUniqueValidPdf(uniqueTag) {
  return Buffer.concat([
    samplePdfBase,
    Buffer.from(`\n% UNIQUE_LOAD_TEST_HASH_${uniqueTag}\n`)
  ]);
}

/**
 * Creates an invalid corrupted PDF buffer.
 */
function createCorruptPdf() {
  return Buffer.from("%PDF-1.4 corrupted payload that lacks valid xref or stream");
}

/**
 * Creates an in-memory transactional database store.
 * Fully isolated: never connects to production database or uses credentials.
 */
function createInMemoryDb() {
  const store = {
    users: new Map(),
    candidateProfiles: new Map(),
    companyCandidates: [],
    jobs: new Map(),
    jobApplications: new Map(),
    resumeProcessing: new Map(),
    inboundEmailEvents: new Map(),
    mailboxes: new Map(),
    companyMembers: new Map(),
    duplicateCandidateInsertAttempts: 0,
    uniqueConstraintErrors: 0,
  };

  // Seed target company and job
  const TARGET_COMPANY_ID = "cmvqkgij6009orfbo8xj7zkzt";
  const TARGET_JOB_ID = "job_load_test_1";

  store.jobs.set(TARGET_JOB_ID, {
    id: TARGET_JOB_ID,
    companyId: TARGET_COMPANY_ID,
    title: "Senior Full Stack Engineer",
    code: "DEV-400",
    inboundEmail: "careers@facebook.company.internal",
    deletedAt: null,
  });

  // Seed target company HR owner and SuperAdmin
  store.users.set("vs2917239@gmail.com", {
    id: "usr_hr_owner",
    email: "vs2917239@gmail.com",
    name: "Facebook HR Owner",
    role: "HR",
    status: "ACTIVE",
    companyMembers: [{ companyId: TARGET_COMPANY_ID, role: "OWNER" }],
  });

  store.users.set("superadmin@hirequest.com", {
    id: "usr_superadmin",
    email: "superadmin@hirequest.com",
    name: "Platform SuperAdmin",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    companyMembers: [],
  });

  return store;
}

/**
 * Installs in-memory database mocks on repositories and Prisma.
 */
function installDbMocks(store, t) {
  const origFindMailbox = mailboxRepository.findMailboxByUserId;
  const origUpdateMailbox = mailboxRepository.updateMailboxSyncStatus;
  const origFindEvents = resumeRepository.findInboundEmailEventsByMessageIds;
  const origCreateEvent = resumeRepository.createInboundEmailEventSafely;
  const origUpdateEvent = resumeRepository.updateInboundEmailEvent;
  const origMarkCompleted = resumeRepository.markInboundEmailEventCompleted;
  const origMarkFailed = resumeRepository.markInboundEmailEventFailed;
  const origFindOldestFailed = resumeRepository.findOldestFailedInboundEvent;
  const origCountUnrecovered = resumeRepository.countUnrecoveredFailedInboundEvents;

  const origFindResumeByHash = resumeRepository.findResumeByHash;
  const origCreateResumeProcessing = resumeRepository.createResumeProcessing;
  const origCreateResumeProcessingSafely = resumeRepository.createResumeProcessingSafely;
  const origUpdateResumeProcessing = resumeRepository.updateResumeProcessing;
  const origFindResumeProcessingById = resumeRepository.findResumeProcessingById;
  const origTouchResumeProcessing = resumeRepository.touchResumeProcessing;
  const origClaimStaleResumeProcessing = resumeRepository.claimStaleResumeProcessing;

  const origFindCandidate = resumeRepository.findCandidateByEmail;
  const origCreateCandidate = resumeRepository.createCandidate;
  const origEnsureProfile = resumeRepository.ensureCandidateProfile;

  const origFindJob = resumeRepository.findJobByInboundEmail;
  const origFindJobByCode = resumeRepository.findJobByCode;
  const origFindApplication = resumeRepository.findJobApplication;
  const origCreateApplication = resumeRepository.createJobApplication;
  const origUpdateApplication = resumeRepository.updateJobApplication;

  const origPrismaTransaction = prisma.$transaction;
  const origFindFirstMember = prisma.companyMember?.findFirst;
  const origFindFirstEvent = prisma.inboundEmailEvent?.findFirst;
  const origUpdateManyProfile = prisma.candidateProfile?.updateMany;

  // Mock mailbox repository
  mailboxRepository.findMailboxByUserId = async (uid) => {
    return store.mailboxes.get(uid) || null;
  };

  mailboxRepository.updateMailboxSyncStatus = async (uid, updates) => {
    const existing = store.mailboxes.get(uid) || { userId: uid };
    const updated = { ...existing, ...updates };
    store.mailboxes.set(uid, updated);
    return updated;
  };

  // Mock resume repository
  resumeRepository.findInboundEmailEventsByMessageIds = async (provider, msgIds) => {
    const results = [];
    for (const id of msgIds) {
      if (store.inboundEmailEvents.has(id)) {
        results.push(store.inboundEmailEvents.get(id));
      }
    }
    return results;
  };

  resumeRepository.createInboundEmailEventSafely = async (data) => {
    if (store.inboundEmailEvents.has(data.providerMessageId)) {
      return store.inboundEmailEvents.get(data.providerMessageId);
    }
    const event = {
      id: "evt_" + data.providerMessageId,
      provider: data.provider,
      providerMessageId: data.providerMessageId,
      recipientEmail: data.recipientEmail,
      status: "PROCESSING",
      createdAt: new Date(),
      receivedAt: new Date(),
    };
    store.inboundEmailEvents.set(data.providerMessageId, event);
    return event;
  };

  resumeRepository.updateInboundEmailEvent = async (id, data) => {
    for (const v of store.inboundEmailEvents.values()) {
      if (v.id === id) {
        Object.assign(v, data);
        return v;
      }
    }
    return { id, ...data };
  };

  resumeRepository.markInboundEmailEventCompleted = async (id, primaryResumeId) => {
    for (const v of store.inboundEmailEvents.values()) {
      if (v.id === id) {
        v.status = "COMPLETED";
        v.primaryResumeId = primaryResumeId;
        v.processedAt = new Date();
        return v;
      }
    }
    return null;
  };

  resumeRepository.findOldestFailedInboundEvent = async (email) => {
    const events = Array.from(store.inboundEmailEvents.values())
      .filter((e) => e.recipientEmail === email && ((e.status === "FAILED" && e.errorCode !== "PERMANENT_FAILURE") || e.status === "PROCESSING" || e.status === "PENDING"))
      .sort((a, b) => {
        const dateA = a.receivedAt ? a.receivedAt.getTime() : a.createdAt.getTime();
        const dateB = b.receivedAt ? b.receivedAt.getTime() : b.createdAt.getTime();
        return dateA - dateB;
      });
    return events[0] || null;
  };

  resumeRepository.countUnrecoveredFailedInboundEvents = async (email) => {
    return Array.from(store.inboundEmailEvents.values())
      .filter((e) => e.recipientEmail === email && ((e.status === "FAILED" && e.errorCode !== "PERMANENT_FAILURE") || e.status === "PROCESSING" || e.status === "PENDING")).length;
  };

  resumeRepository.markInboundEmailEventFailed = async (id, errCode, errMsg) => {
    for (const v of store.inboundEmailEvents.values()) {
      if (v.id === id) {
        v.status = "FAILED";
        v.errorCode = errCode;
        v.errorMessage = errMsg;
        v.failedAt = new Date();
        return v;
      }
    }
    return null;
  };

  resumeRepository.findResumeByHash = async (fileHash) => {
    return store.resumeProcessing.get(fileHash) || null;
  };

  resumeRepository.createResumeProcessing = async (data) => {
    if (store.resumeProcessing.has(data.fileHash)) {
      const existing = store.resumeProcessing.get(data.fileHash);
      if (existing.status !== "FAILED") {
        store.uniqueConstraintErrors++;
        const p2002 = new Error("Unique constraint failed on the fields: (fileHash)");
        p2002.code = "P2002";
        throw p2002;
      }
    }
    const item = {
      id: "rp_" + Math.random().toString(36).slice(2, 9),
      ...data,
      status: data.status || "PENDING",
      createdAt: new Date(),
      applications: [],
    };
    store.resumeProcessing.set(data.fileHash, item);
    return item;
  };

  resumeRepository.createResumeProcessingSafely = async (data) => {
    if (store.resumeProcessing.has(data.fileHash)) {
      return store.resumeProcessing.get(data.fileHash);
    }
    return await resumeRepository.createResumeProcessing(data);
  };

  resumeRepository.updateResumeProcessing = async (id, data) => {
    for (const v of store.resumeProcessing.values()) {
      if (v.id === id) {
        Object.assign(v, data);
        return v;
      }
    }
    return { id, ...data };
  };

  resumeRepository.touchResumeProcessing = async (id) => {
    for (const v of store.resumeProcessing.values()) {
      if (v.id === id) {
        v.updatedAt = new Date();
        return v;
      }
    }
    return null;
  };

  resumeRepository.claimStaleResumeProcessing = async (id, staleBefore) => {
    for (const v of store.resumeProcessing.values()) {
      if (v.id === id) {
        const isStale =
          v.status === "FAILED" ||
          v.status === "PENDING" ||
          (v.status === "PROCESSING" && new Date(v.updatedAt).getTime() < new Date(staleBefore).getTime());
        if (isStale) {
          v.status = "PROCESSING";
          v.updatedAt = new Date();
          v.errorCode = null;
          v.errorMessage = null;
          return true;
        }
        return false;
      }
    }
    return false;
  };

  resumeRepository.findResumeProcessingById = async (id) => {
    for (const v of store.resumeProcessing.values()) {
      if (v.id === id) return v;
    }
    return null;
  };

  resumeRepository.findCandidateByEmail = async (email) => {
    if (!email) return null;
    return store.users.get(email.trim().toLowerCase()) || null;
  };

  resumeRepository.createCandidate = async (data) => {
    const norm = data.email.trim().toLowerCase();
    if (store.users.has(norm)) {
      store.duplicateCandidateInsertAttempts++;
      store.uniqueConstraintErrors++;
      const p2002 = new Error("Unique constraint failed on the fields: (email)");
      p2002.code = "P2002";
      throw p2002;
    }
    const user = {
      id: "usr_" + Math.random().toString(36).slice(2, 9),
      ...data,
      email: norm,
      role: data.role || "CANDIDATE",
      companyMembers: [],
    };
    store.users.set(norm, user);
    return user;
  };

  resumeRepository.ensureCandidateProfile = async (user, data = {}, companyId = null) => {
    const norm = user.email.trim().toLowerCase();
    let profile = store.candidateProfiles.get(norm);
    if (!profile) {
      profile = {
        id: "cprof_" + Math.random().toString(36).slice(2, 9),
        userId: user.id,
        email: norm,
        firstName: data.name ? data.name.split(" ")[0] : "Candidate",
        lastName: data.name ? data.name.split(" ").slice(1).join(" ") : "",
        companyId: companyId || null,
        metadata: { ...data },
      };
      store.candidateProfiles.set(norm, profile);
    } else {
      if (!profile.companyId && companyId) {
        profile.companyId = companyId;
      }
      profile.metadata = { ...profile.metadata, ...data };
    }

    if (companyId) {
      const exists = store.companyCandidates.some(
        (cc) => cc.companyId === companyId && cc.candidateId === profile.id
      );
      if (!exists) {
        store.companyCandidates.push({ companyId, candidateId: profile.id });
      }
    }
    return profile;
  };

  resumeRepository.findJobByInboundEmail = async (inboundEmail) => {
    for (const j of store.jobs.values()) {
      if (j.inboundEmail.toLowerCase() === inboundEmail.toLowerCase()) return j;
    }
    return null;
  };

  resumeRepository.findJobByCode = async (code) => {
    for (const j of store.jobs.values()) {
      if (j.code.toUpperCase() === code.toUpperCase()) return j;
    }
    return null;
  };

  resumeRepository.findJobApplication = async (jobId, candidateId) => {
    return store.jobApplications.get(`${jobId}_${candidateId}`) || null;
  };

  resumeRepository.createJobApplication = async (data) => {
    const key = `${data.jobId}_${data.candidateId}`;
    if (store.jobApplications.has(key)) {
      const p2002 = new Error("Unique constraint failed on the fields: (jobId, candidateId)");
      p2002.code = "P2002";
      throw p2002;
    }
    const app = {
      id: "app_" + Math.random().toString(36).slice(2, 9),
      ...data,
      appliedAt: new Date(),
    };
    store.jobApplications.set(key, app);

    // Link application to resumeProcessing
    for (const v of store.resumeProcessing.values()) {
      if (v.id === data.resumeProcessingId) {
        v.applications.push(app);
      }
    }
    return app;
  };

  resumeRepository.updateJobApplication = async (id, data) => {
    for (const v of store.jobApplications.values()) {
      if (v.id === id) {
        Object.assign(v, data);
        return v;
      }
    }
    return { id, ...data };
  };

  // Mock Prisma transaction
  prisma.$transaction = async (fn) => {
    return fn(prisma);
  };

  if (prisma.companyMember) {
    prisma.companyMember.findFirst = async ({ where }) => {
      const user = Array.from(store.users.values()).find((u) => u.id === where.userId);
      if (user && user.companyMembers) {
        const found = user.companyMembers.find(
          (m) => !where.companyId || m.companyId === where.companyId
        );
        return found || null;
      }
      return null;
    };
  }

  if (prisma.inboundEmailEvent) {
    prisma.inboundEmailEvent.findFirst = async ({ where }) => {
      const events = Array.from(store.inboundEmailEvents.values())
        .filter((e) => e.recipientEmail === where.recipientEmail && e.status === where.status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return events[0] || null;
    };
  }

  if (prisma.candidateProfile) {
    prisma.candidateProfile.updateMany = async () => ({ count: 1 });
  }

  return () => {
    mailboxRepository.findMailboxByUserId = origFindMailbox;
    mailboxRepository.updateMailboxSyncStatus = origUpdateMailbox;
    resumeRepository.findInboundEmailEventsByMessageIds = origFindEvents;
    resumeRepository.createInboundEmailEventSafely = origCreateEvent;
    resumeRepository.updateInboundEmailEvent = origUpdateEvent;
    resumeRepository.markInboundEmailEventCompleted = origMarkCompleted;
    resumeRepository.markInboundEmailEventFailed = origMarkFailed;
    resumeRepository.findOldestFailedInboundEvent = origFindOldestFailed;
    resumeRepository.countUnrecoveredFailedInboundEvents = origCountUnrecovered;

    resumeRepository.findResumeByHash = origFindResumeByHash;
    resumeRepository.createResumeProcessing = origCreateResumeProcessing;
    resumeRepository.createResumeProcessingSafely = origCreateResumeProcessingSafely;
    resumeRepository.updateResumeProcessing = origUpdateResumeProcessing;
    resumeRepository.findResumeProcessingById = origFindResumeProcessingById;
    resumeRepository.touchResumeProcessing = origTouchResumeProcessing;
    resumeRepository.claimStaleResumeProcessing = origClaimStaleResumeProcessing;

    resumeRepository.findCandidateByEmail = origFindCandidate;
    resumeRepository.createCandidate = origCreateCandidate;
    resumeRepository.ensureCandidateProfile = origEnsureProfile;

    resumeRepository.findJobByInboundEmail = origFindJob;
    resumeRepository.findJobByCode = origFindJobByCode;
    resumeRepository.findJobApplication = origFindApplication;
    resumeRepository.createJobApplication = origCreateApplication;
    resumeRepository.updateJobApplication = origUpdateApplication;

    prisma.$transaction = origPrismaTransaction;
    if (prisma.companyMember) prisma.companyMember.findFirst = origFindFirstMember;
    if (prisma.inboundEmailEvent) prisma.inboundEmailEvent.findFirst = origFindFirstEvent;
    if (prisma.candidateProfile) prisma.candidateProfile.updateMany = origUpdateManyProfile;
  };
}

/**
 * Generates synthetic batch fixtures across 10 controlled categories.
 */
function generateTestBatch(totalCases, options = {}) {
  const messages = [];
  const attachmentMap = new Map();
  const driveFileMap = new Map();
  const simulatedFailures = new Set(options.simulatedFailures || []);

  let caseIndex = 0;

  // Helper to add an email fixture
  function addMessage({
    subject,
    sender,
    attachments = [],
    driveLinks = [],
    internalDate = Date.now() - (totalCases - caseIndex) * 60000,
  }) {
    caseIndex++;
    const msgId = `msg_load_${String(caseIndex).padStart(4, "0")}`;

    const parts = [
      {
        mimeType: "text/plain",
        body: { data: Buffer.from(`Application for ${subject}`).toString("base64url") },
      },
    ];

    if (driveLinks.length > 0) {
      const htmlContent = driveLinks
        .map((id) => `<p><a href="https://drive.google.com/file/d/${id}/view">Resume Drive</a></p>`)
        .join("");
      parts.push({
        mimeType: "text/html",
        body: { data: Buffer.from(htmlContent).toString("base64url") },
      });
    }

    const attEntries = [];
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const attId = `att_${msgId}_${i + 1}`;
      attachmentMap.set(attId, att.buffer);
      attEntries.push({
        filename: att.filename,
        mimeType: att.mimeType || "application/pdf",
        attachmentId: attId,
        size: att.buffer.length,
      });
      parts.push({
        filename: att.filename,
        mimeType: att.mimeType || "application/pdf",
        body: { attachmentId: attId, size: att.buffer.length },
      });
    }

    messages.push({
      id: msgId,
      internalDate: String(internalDate),
      payload: {
        headers: [
          { name: "Subject", value: subject },
          { name: "From", value: sender },
          { name: "To", value: "careers@facebook.company.internal" },
        ],
        mimeType: "multipart/mixed",
        parts,
      },
    });
  }

  // 1. Determine distribution counts for totalCases
  const corruptCount = Math.max(1, Math.round(totalCases * 0.025)); // 2.5% corrupt PDF
  const emptyCount = Math.max(1, Math.round(totalCases * 0.015));   // 1.5% empty file
  const driveCount = Math.max(2, Math.round(totalCases * 0.10));    // 10% Google Drive links
  const multiAttCount = Math.max(1, Math.round(totalCases * 0.05)); // 5% multi-attachment emails (2 resumes each)
  const nonCandidateCount = Math.max(1, Math.round(totalCases * 0.02)); // 2% non-candidate accounts
  const repeatCandidateCount = Math.max(2, Math.round(totalCases * 0.08)); // 8% repeated email submissions
  const transientFailCount = Math.max(1, Math.round(totalCases * 0.02)); // 2% transient failures
  const unrelatedCount = Math.max(1, Math.round(totalCases * 0.03)); // 3% clearly unrelated messages (invoices/receipts)
  const genericCount = Math.max(1, Math.round(totalCases * 0.03));   // 3% generic / empty subjects

  let generated = 0;

  // Category A: Corrupt PDFs
  for (let i = 0; i < corruptCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: `[JOB: DEV-400] Application Corrupt PDF ${i + 1}`,
      sender: `corrupt.applicant.${i + 1}@example.com`,
      attachments: [{ filename: `resume_corrupt_${i + 1}.pdf`, buffer: createCorruptPdf() }],
    });
  }

  // Category B: Empty Files
  for (let i = 0; i < emptyCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: `[JOB: DEV-400] Application Empty File ${i + 1}`,
      sender: `empty.file.${i + 1}@example.com`,
      attachments: [{ filename: `resume_empty_${i + 1}.pdf`, buffer: Buffer.alloc(0) }],
    });
  }

  // Category C: Non-candidate account submissions (SuperAdmin / HR)
  for (let i = 0; i < nonCandidateCount && generated < totalCases; i++) {
    generated++;
    const isSuperAdmin = i % 2 === 0;
    const sender = isSuperAdmin ? "superadmin@hirequest.com" : "vs2917239@gmail.com";
    addMessage({
      subject: `[JOB: DEV-400] Non-Candidate Submission ${i + 1}`,
      sender,
      attachments: [
        {
          filename: `internal_doc_${i + 1}.pdf`,
          buffer: createUniqueValidPdf(`non_cand_${i + 1}`),
        },
      ],
    });
  }

  // Category D: Google Drive Links
  for (let i = 0; i < driveCount && generated < totalCases; i++) {
    generated++;
    const fileId = `1DriveFileId_${String(generated).padStart(5, "0")}_abcdefghij`;
    driveFileMap.set(fileId, {
      buffer: createUniqueValidPdf(`drive_${generated}`),
      filename: `drive_resume_${generated}.pdf`,
      mimetype: "application/pdf",
      size: samplePdfBase.length,
    });
    addMessage({
      subject: `[JOB: DEV-400] Application via Google Drive ${i + 1}`,
      sender: `drive.applicant.${generated}@example.com`,
      driveLinks: [fileId],
    });
  }

  // Category E: Multi-attachment emails (2 resumes per email)
  for (let i = 0; i < multiAttCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: `[JOB: DEV-400] Multi-Resume Submission ${i + 1}`,
      sender: `multi.applicant.${i + 1}@example.com`,
      attachments: [
        { filename: `resume_primary_${i + 1}.pdf`, buffer: createUniqueValidPdf(`multi_p_${i + 1}`) },
        { filename: `resume_portfolio_${i + 1}.pdf`, buffer: createUniqueValidPdf(`multi_s_${i + 1}`) },
      ],
    });
  }

  // Category F: Repeated emails / concurrent candidate submissions
  const sharedCandidateEmail = "shared.candidate.concurrency@example.com";
  for (let i = 0; i < repeatCandidateCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: `[JOB: DEV-400] Application Re-submission ${i + 1}`,
      sender: sharedCandidateEmail,
      attachments: [
        {
          filename: `candidate_update_${i + 1}.pdf`,
          buffer: createUniqueValidPdf(`repeat_${i + 1}`),
        },
      ],
    });
  }

  // Category G: Transient network failure simulated on attachment download
  for (let i = 0; i < transientFailCount && generated < totalCases; i++) {
    generated++;
    const msgId = `msg_load_${String(caseIndex + 1).padStart(4, "0")}`;
    simulatedFailures.add(`att_${msgId}_1`);
    addMessage({
      subject: `[JOB: DEV-400] Application Transient Failure ${i + 1}`,
      sender: `transient.applicant.${generated}@example.com`,
      attachments: [
        {
          filename: `resume_transient_${generated}.pdf`,
          buffer: createUniqueValidPdf(`transient_${generated}`),
        },
      ],
    });
  }

  // Category H1: Clearly Unrelated Messages (Invoices, Receipts, Security Alerts)
  for (let i = 0; i < unrelatedCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: `Your AWS Cloud Invoice Statement #${1000 + i}`,
      sender: `no-reply@billing.aws.amazon.com`,
      attachments: [{ filename: `invoice_${1000 + i}.pdf`, buffer: createUniqueValidPdf(`aws_invoice_${i}`) }],
    });
  }

  // Category H2: Generic subjects and empty bodies (must NOT be rejected)
  for (let i = 0; i < genericCount && generated < totalCases; i++) {
    generated++;
    addMessage({
      subject: i % 2 === 0 ? "Details" : "",
      sender: `generic.cand.${i + 1}@example.com`,
      attachments: [{ filename: `cand_${i + 1}_resume.pdf`, buffer: createUniqueValidPdf(`generic_${i + 1}`) }],
    });
  }

  // Category H: Standard Unique Resumes for remaining capacity
  while (generated < totalCases) {
    generated++;
    addMessage({
      subject: `[JOB: DEV-400] Application Engineer ${generated}`,
      sender: `applicant.unique.${generated}@example.com`,
      attachments: [
        {
          filename: `resume_eng_${generated}.pdf`,
          buffer: createUniqueValidPdf(`eng_${generated}`),
        },
      ],
    });
  }

  return {
    messages,
    attachmentMap,
    driveFileMap,
    simulatedFailures,
  };
}

/**
 * Mocks the Google Gmail and Google Drive SDK clients in memory.
 */
function installGoogleClientMocks({ messages, attachmentMap, driveFileMap, simulatedFailures, transientFailAttempts = new Map() }) {
  const origCreateOAuth2 = mailboxService.createOAuth2Client;
  const origGmail = google.gmail;
  const origDownloadDrive = driveService.downloadDriveFile;

  google.gmail = () => ({
    users: {
      messages: {
        list: async (params) => {
          let filtered = [...messages];
          if (params.q) {
            const afterMatch = params.q.match(/after:(\d+)/);
            if (afterMatch) {
              const epochMs = parseInt(afterMatch[1], 10) * 1000;
              filtered = filtered.filter((m) => parseInt(m.internalDate, 10) >= epochMs);
            }
          }

          // Order descending by internalDate (newest first, identical to Gmail API)
          filtered.sort((a, b) => parseInt(b.internalDate, 10) - parseInt(a.internalDate, 10));

          const maxResults = params.maxResults || 25;
          let startIndex = 0;
          if (params.pageToken) {
            startIndex = parseInt(params.pageToken.replace("token_", ""), 10) || 0;
          }

          const pageMessages = filtered.slice(startIndex, startIndex + maxResults);
          const nextIndex = startIndex + maxResults;
          const nextPageToken = nextIndex < filtered.length ? `token_${nextIndex}` : undefined;

          return {
            data: {
              messages: pageMessages.map((m) => ({ id: m.id })),
              nextPageToken,
            },
          };
        },

        get: async (params) => {
          const msg = messages.find((m) => m.id === params.id);
          if (!msg) throw new Error("Message not found: " + params.id);
          return { data: msg };
        },

        attachments: {
          get: async (params) => {
            if (simulatedFailures && simulatedFailures.has(params.id)) {
              const attempts = transientFailAttempts.get(params.id) || 0;
              transientFailAttempts.set(params.id, attempts + 1);
              if (attempts === 0) {
                // Fail once transiently
                const err = new Error("Simulated transient socket timeout on attachment download");
                err.code = "ECONNRESET";
                throw err;
              }
            }

            const buf = attachmentMap.get(params.id);
            if (!buf) throw new Error("Attachment not found: " + params.id);
            return {
              data: {
                data: buf.toString("base64"),
              },
            };
          },
        },
      },
    },
  });

  driveService.downloadDriveFile = async ({ fileId }) => {
    if (simulatedFailures && simulatedFailures.has(fileId)) {
      const attempts = transientFailAttempts.get(fileId) || 0;
      transientFailAttempts.set(fileId, attempts + 1);
      if (attempts === 0) {
        const err = new Error("Simulated transient Drive rate limit error (429)");
        err.code = "DRIVE_RATE_LIMIT";
        throw err;
      }
    }

    const driveEntry = driveFileMap.get(fileId);
    if (!driveEntry) {
      const err = new Error("Google Drive file not found: " + fileId);
      err.code = "DRIVE_FILE_NOT_FOUND";
      throw err;
    }

    return {
      buffer: driveEntry.buffer,
      originalname: driveEntry.filename,
      mimetype: driveEntry.mimetype,
      size: driveEntry.size,
    };
  };

  return () => {
    google.gmail = origGmail;
    driveService.downloadDriveFile = origDownloadDrive;
  };
}

/**
 * Runs a mailbox sync batch and records detailed performance metrics.
 */
async function runLoadBatch(caseCount, options = {}) {
  const store = createInMemoryDb();
  const uninstallDb = installDbMocks(store);

  const TEST_USER_ID = "usr_recruiter_facebook";
  store.mailboxes.set(TEST_USER_ID, {
    userId: TEST_USER_ID,
    email: "vs2917239@gmail.com",
    refreshToken: "mock-refresh-token",
    lastSyncedAt: null,
    backfillComplete: false,
  });

  const fixture = generateTestBatch(caseCount, options);
  const uninstallGoogle = installGoogleClientMocks(fixture);

  const startCpu = process.cpuUsage();
  const startMemory = process.memoryUsage();
  const startTime = performance.now();

  let syncRounds = 0;
  let totalScanned = 0;
  let totalProcessed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  try {
    // Repeatedly sync until all pages have been scanned or backfill is complete
    while (true) {
      syncRounds++;
      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 60000);
      totalScanned += res.scanned;
      totalProcessed += res.processedResumes;
      totalFailed += res.failed;
      totalSkipped += res.skipped;

      if (res.scanned === 0 || res.nextPageToken === undefined) {
        // In incremental mode, check if all messages have been discovered
        const completedOrFailedCount = Array.from(store.inboundEmailEvents.values())
          .filter((e) => e.status === "COMPLETED" || e.status === "FAILED").length;
        if (completedOrFailedCount >= fixture.messages.length) {
          break;
        }
        if (syncRounds >= 20) {
          // Safety cutoff
          break;
        }
      }
    }
  } finally {
    uninstallGoogle();
    uninstallDb();
  }

  const durationMs = performance.now() - startTime;
  const cpuDiff = process.cpuUsage(startCpu);
  const endMemory = process.memoryUsage();

  // Metrics aggregation from store
  const eventList = Array.from(store.inboundEmailEvents.values());
  const completedEvents = eventList.filter((e) => e.status === "COMPLETED");
  const failedEvents = eventList.filter((e) => e.status === "FAILED");
  const pendingOrProcessingEvents = eventList.filter(
    (e) => e.status === "PENDING" || e.status === "PROCESSING"
  );

  const resumeList = Array.from(store.resumeProcessing.values());
  const completedResumes = resumeList.filter(
    (r) => r.status === "COMPLETED" || r.status === "REVIEW_REQUIRED"
  );
  const failedResumes = resumeList.filter((r) => r.status === "FAILED");
  const pendingOrProcessingResumes = resumeList.filter(
    (r) => r.status === "PENDING" || r.status === "PROCESSING"
  );

  // Group failures by error code
  const failuresByCategory = {};
  for (const r of failedResumes) {
    const code = r.errorCode || "UNKNOWN_ERROR";
    failuresByCategory[code] = (failuresByCategory[code] || 0) + 1;
  }
  for (const e of failedEvents) {
    if (e.errorCode && !failuresByCategory[e.errorCode]) {
      failuresByCategory[e.errorCode] = (failuresByCategory[e.errorCode] || 0) + 1;
    }
  }

  const durationSec = durationMs / 1000;
  const resumesPerMinute = durationSec > 0 ? (completedResumes.length / durationSec) * 60 : 0;

  return {
    caseCount,
    syncRounds,
    durationMs: Math.round(durationMs),
    resumesPerMinute: Math.round(resumesPerMinute * 10) / 10,
    cpuUserMs: Math.round(cpuDiff.user / 1000),
    cpuSystemMs: Math.round(cpuDiff.system / 1000),
    heapUsedMb: Math.round((endMemory.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((endMemory.heapTotal / 1024 / 1024) * 10) / 10,
    rssMb: Math.round((endMemory.rss / 1024 / 1024) * 10) / 10,
    events: {
      total: eventList.length,
      completed: completedEvents.length,
      failed: failedEvents.length,
      stuckProcessing: pendingOrProcessingEvents.length,
    },
    resumes: {
      total: resumeList.length,
      completed: completedResumes.length,
      failed: failedResumes.length,
      stuckProcessing: pendingOrProcessingResumes.length,
    },
    candidates: {
      totalCreated: store.users.size - 2, // exclude seeded admin & HR
      profilesEnsured: store.candidateProfiles.size,
      duplicateInsertAttempts: store.duplicateCandidateInsertAttempts,
      uniqueConstraintErrors: store.uniqueConstraintErrors,
    },
    applications: {
      totalCreated: store.jobApplications.size,
    },
    failuresByCategory,
  };
}

module.exports = {
  createInMemoryDb,
  installDbMocks,
  generateTestBatch,
  installGoogleClientMocks,
  runLoadBatch,
  createUniqueValidPdf,
};

if (process.env.NODE_TEST_CONTEXT) {
  const { describe, it } = require("node:test");
  const assert = require("node:assert/strict");

  describe("Mailbox Load and Reliability Test Suite", () => {
    it("runs 50 resume load batch reliably", async () => {
      const res = await runLoadBatch(50);
      assert.equal(res.events.stuckProcessing, 0, "No records may remain stuck in PROCESSING");
      assert.ok(res.resumes.completed >= 45, "Must complete majority of eligible resumes");
      assert.equal(res.candidates.duplicateInsertAttempts, 0, "No duplicate candidate inserts");
    });

    it("runs 100 resume load batch reliably", async () => {
      const res = await runLoadBatch(100);
      assert.equal(res.events.stuckProcessing, 0, "No records may remain stuck in PROCESSING");
      assert.ok(res.resumes.completed >= 90, "Must complete majority of eligible resumes");
      assert.equal(res.candidates.duplicateInsertAttempts, 0, "No duplicate candidate inserts");
    });
  });
}
