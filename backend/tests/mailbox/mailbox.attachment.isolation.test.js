"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const resumeService = require("../../src/modules/resume/resume.service");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");

describe("Phase 3: Mailbox Attachment Isolation & Lightweight Filtering Suite", () => {
  let origFindMailbox;
  let origUpdateMailbox;
  let origFindEvents;
  let origCreateEvent;
  let origUpdateEvent;
  let origMarkCompleted;
  let origMarkFailed;
  let origProcessResume;
  let origDownloadDrive;
  let origFindFirstMember;
  let origUpdateManyProfile;

  const eventStore = new Map();
  let attachmentsGetCallCount = 0;

  const dummyPdfHeader = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

  beforeEach(() => {
    attachmentsGetCallCount = 0;
    eventStore.clear();

    origFindMailbox = mailboxRepository.findMailboxByUserId;
    origUpdateMailbox = mailboxRepository.updateMailboxSyncStatus;
    origFindEvents = resumeRepository.findInboundEmailEventsByMessageIds;
    origCreateEvent = resumeRepository.createInboundEmailEventSafely;
    origUpdateEvent = resumeRepository.updateInboundEmailEvent;
    origMarkCompleted = resumeRepository.markInboundEmailEventCompleted;
    origMarkFailed = resumeRepository.markInboundEmailEventFailed;
    origProcessResume = resumeService.processResume;
    origDownloadDrive = driveService.downloadDriveFile;
    origFindFirstMember = prisma.companyMember?.findFirst;
    origUpdateManyProfile = prisma.candidateProfile?.updateMany;

    if (prisma.companyMember) {
      prisma.companyMember.findFirst = async () => ({ companyId: "comp_iso_001" });
    }
    if (prisma.candidateProfile) {
      prisma.candidateProfile.updateMany = async () => ({ count: 1 });
    }

    resumeRepository.createInboundEmailEventSafely = async (data) => {
      const evt = {
        id: "evt_" + data.providerMessageId,
        provider: data.provider,
        providerMessageId: data.providerMessageId,
        recipientEmail: data.recipientEmail,
        status: "PROCESSING",
        createdAt: new Date(),
        receivedAt: new Date(),
      };
      eventStore.set(data.providerMessageId, evt);
      return evt;
    };

    resumeRepository.updateInboundEmailEvent = async (id, data) => {
      for (const e of eventStore.values()) {
        if (e.id === id) {
          Object.assign(e, data);
          return e;
        }
      }
      return { id, ...data };
    };

    resumeRepository.markInboundEmailEventCompleted = async (id, resId) => {
      for (const e of eventStore.values()) {
        if (e.id === id) {
          e.status = "COMPLETED";
          e.resumeProcessingId = resId;
          e.completedAt = new Date();
          return e;
        }
      }
      return null;
    };

    resumeRepository.markInboundEmailEventFailed = async (id, code, msg) => {
      for (const e of eventStore.values()) {
        if (e.id === id) {
          e.status = "FAILED";
          e.errorCode = code;
          e.errorMessage = msg;
          return e;
        }
      }
      return null;
    };
  });

  afterEach(() => {
    mailboxRepository.findMailboxByUserId = origFindMailbox;
    mailboxRepository.updateMailboxSyncStatus = origUpdateMailbox;
    resumeRepository.findInboundEmailEventsByMessageIds = origFindEvents;
    resumeRepository.createInboundEmailEventSafely = origCreateEvent;
    resumeRepository.updateInboundEmailEvent = origUpdateEvent;
    resumeRepository.markInboundEmailEventCompleted = origMarkCompleted;
    resumeRepository.markInboundEmailEventFailed = origMarkFailed;
    resumeService.processResume = origProcessResume;
    driveService.downloadDriveFile = origDownloadDrive;
    if (prisma.companyMember) prisma.companyMember.findFirst = origFindFirstMember;
    if (prisma.candidateProfile) prisma.candidateProfile.updateMany = origUpdateManyProfile;
  });

  it("7. Clearly unrelated email (invoice/receipt) does NOT trigger attachment binary download", async () => {
    const mockGmail = {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: "msg_invoice_01",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Your Monthly Uber Receipt - Payment Confirmed" },
                  { name: "From", value: "billing@uber.com" },
                ],
                parts: [
                  {
                    filename: "receipt_january.pdf",
                    mimeType: "application/pdf",
                    body: { attachmentId: "att_inv_1", size: 1024 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async () => {
              attachmentsGetCallCount++;
              return { data: { data: Buffer.from("dummy").toString("base64") } };
            },
          },
        },
      },
    };

    const mailbox = { email: "recruiter@example.com" };

    // Trigger syncMailboxForUser or call processSingleGmailMessage through sync
    // In mailboxService, we can test via syncMailboxForUser
    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_test_1",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      lastSyncedAt: null,
      backfillComplete: true,
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});

    mockGmail.users.messages.list = async () => ({
      data: { messages: [{ id: "msg_invoice_01" }] },
    });

    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const { google } = require("googleapis");
    const origGoogleGmail = google.gmail;
    google.gmail = () => mockGmail;

    try {
      const res = await mailboxService.syncMailboxForUser("usr_test_1", 10000);
      assert.equal(res.skippedUnrelated, 1, "Must be skipped as unrelated");
      assert.equal(attachmentsGetCallCount, 0, "Attachment binary must NEVER be downloaded for unrelated email");
    } finally {
      google.gmail = origGoogleGmail;
    }
  });

  it("8. Valid Tech resume plus a cover letter does NOT cause a permanent email retry loop", async () => {
    // Message with 2 attachments:
    // 1. resume.pdf (Valid Tech Resume) -> succeeds
    // 2. cover_letter.docx (Cover letter / NOT_A_RESUME) -> fails with NOT_A_RESUME (deterministic)
    const mockGmail = {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: "msg_multi_02",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Application for Full Stack Developer - John Doe" },
                  { name: "From", value: "john.doe@example.com" },
                ],
                parts: [
                  {
                    filename: "John_Doe_Resume.pdf",
                    mimeType: "application/pdf",
                    body: { attachmentId: "att_resume_1", size: 5000 },
                  },
                  {
                    filename: "Cover_Letter.docx",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    body: { attachmentId: "att_cover_2", size: 3000 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async ({ id }) => {
              return { data: { data: Buffer.from(dummyPdfHeader + id).toString("base64") } };
            },
          },
        },
      },
    };

    resumeService.processResume = async ({ file }) => {
      if (file.originalname.includes("Resume")) {
        return {
          duplicate: false,
          candidateId: "usr_john_01",
          resumeProcessing: { id: "rp_john_01", status: "COMPLETED" },
          application: null,
        };
      } else {
        const err = new Error("Cover letter is not a resume");
        err.code = "NOT_A_RESUME";
        err.isDeterministic = true;
        throw err;
      }
    };

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_test_2",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      lastSyncedAt: null,
      backfillComplete: true,
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});

    mockGmail.users.messages.list = async () => ({
      data: { messages: [{ id: "msg_multi_02" }] },
    });
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const { google } = require("googleapis");
    const origGoogleGmail = google.gmail;
    google.gmail = () => mockGmail;

    try {
      const res = await mailboxService.syncMailboxForUser("usr_test_2", 10000);
      assert.equal(res.processedResumes, 1, "Resume must be processed");
      assert.equal(res.failed, 0, "Email must NOT be marked failed when candidate resume succeeded");
      const event = eventStore.get("msg_multi_02");
      assert.equal(event.status, "COMPLETED", "Event must be COMPLETED without triggering retry loop");
    } finally {
      google.gmail = origGoogleGmail;
    }
  });

  it("9. Valid Tech resume plus transiently failing potential Tech resume remains recoverable", async () => {
    // Message with 2 resumes:
    // 1. Resume_1.pdf -> succeeds
    // 2. Resume_2.pdf -> transient socket timeout
    let attempt = 0;
    const mockGmail = {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: "msg_multi_transient_03",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Candidate Submissions" },
                  { name: "From", value: "consultant@example.com" },
                ],
                parts: [
                  {
                    filename: "Candidate_1.pdf",
                    mimeType: "application/pdf",
                    body: { attachmentId: "att_trans_1", size: 5000 },
                  },
                  {
                    filename: "Candidate_2.pdf",
                    mimeType: "application/pdf",
                    body: { attachmentId: "att_trans_2", size: 5000 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async ({ id }) => {
              if (id === "att_trans_2" && attempt === 0) {
                const netErr = new Error("Socket timeout during attachment download");
                netErr.code = "ETIMEDOUT";
                netErr.isDeterministic = false;
                throw netErr;
              }
              return { data: { data: Buffer.from(dummyPdfHeader + id).toString("base64") } };
            },
          },
        },
      },
    };

    resumeService.processResume = async ({ file }) => ({
      duplicate: false,
      candidateId: "usr_" + file.originalname,
      resumeProcessing: { id: "rp_" + file.originalname, status: "COMPLETED" },
      application: null,
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_test_3",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      lastSyncedAt: null,
      backfillComplete: true,
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    mockGmail.users.messages.list = async () => ({
      data: { messages: [{ id: "msg_multi_transient_03" }] },
    });
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const { google } = require("googleapis");
    const origGoogleGmail = google.gmail;
    google.gmail = () => mockGmail;

    try {
      // First sync: att_trans_2 fails transiently
      const res1 = await mailboxService.syncMailboxForUser("usr_test_3", 10000);
      assert.equal(res1.failed, 1, "Must be marked failed on transient error");
      const event1 = eventStore.get("msg_multi_transient_03");
      assert.equal(event1.status, "FAILED", "Event must be FAILED to remain retryable");
      assert.ok(event1.errorMessage.includes("Attempt 2/3"));

      // Second sync: transient error resolved, att_trans_2 succeeds
      attempt = 1;
      resumeRepository.findInboundEmailEventsByMessageIds = async () => [event1];
      const res2 = await mailboxService.syncMailboxForUser("usr_test_3", 10000);
      assert.equal(res2.failed, 0, "Must succeed on second sync");
      assert.equal(event1.status, "COMPLETED", "Event must transition to COMPLETED on recovery");
    } finally {
      google.gmail = origGoogleGmail;
    }
  });

  it("13. Drive-link-only Tech resumes remain supported and ingested", async () => {
    const mockGmail = {
      users: {
        messages: {
          get: async () => ({
            data: {
              id: "msg_drive_only_04",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Resume - React Native Developer" },
                  { name: "From", value: "mobile.dev@example.com" },
                ],
                parts: [
                  {
                    mimeType: "text/plain",
                    body: {
                      data: Buffer.from(
                        "Hi HR Team,\nHere is my Google Drive resume:\nhttps://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing\nThanks!"
                      ).toString("base64url"),
                    },
                  },
                ],
              },
            },
          }),
        },
      },
    };

    driveService.downloadDriveFile = async () => ({
      buffer: Buffer.from(dummyPdfHeader + "drive_content"),
      originalname: "mobile_dev_resume.pdf",
      mimetype: "application/pdf",
      size: 4000,
      fileId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
    });

    resumeService.processResume = async () => ({
      duplicate: false,
      candidateId: "usr_drive_dev",
      resumeProcessing: { id: "rp_drive_dev", status: "COMPLETED" },
      application: null,
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_test_4",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      lastSyncedAt: null,
      backfillComplete: true,
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    mockGmail.users.messages.list = async () => ({
      data: { messages: [{ id: "msg_drive_only_04" }] },
    });
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const { google } = require("googleapis");
    const origGoogleGmail = google.gmail;
    google.gmail = () => mockGmail;

    try {
      const res = await mailboxService.syncMailboxForUser("usr_test_4", 10000);
      assert.equal(res.processedResumes, 1, "Drive-link-only Tech resume must be ingested");
      assert.equal(res.failed, 0);
      const event = eventStore.get("msg_drive_only_04");
      assert.equal(event.status, "COMPLETED");
    } finally {
      google.gmail = origGoogleGmail;
    }
  });
});

