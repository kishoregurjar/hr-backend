"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { google } = require("googleapis");

const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const resumeService = require("../../src/modules/resume/resume.service");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");
const { processMailboxSync } = require("../../src/workers/mailbox-sync.worker");

describe("Gmail Mailbox Sync: Date-Range Filtering & Guard Suite", () => {
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
  let origGoogleGmail;
  let origFindActiveMailboxes;

  const eventStore = new Map();
  let attachmentsGetCallCount = 0;
  let driveDownloadCallCount = 0;
  let processResumeCallCount = 0;

  const dummyPdfHeader = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

  beforeEach(() => {
    attachmentsGetCallCount = 0;
    driveDownloadCallCount = 0;
    processResumeCallCount = 0;
    eventStore.clear();

    origFindMailbox = mailboxRepository.findMailboxByUserId;
    origUpdateMailbox = mailboxRepository.updateMailboxSyncStatus;
    origFindActiveMailboxes = mailboxRepository.findActiveDateRangeMailboxes;
    origFindEvents = resumeRepository.findInboundEmailEventsByMessageIds;
    origCreateEvent = resumeRepository.createInboundEmailEventSafely;
    origUpdateEvent = resumeRepository.updateInboundEmailEvent;
    origMarkCompleted = resumeRepository.markInboundEmailEventCompleted;
    origMarkFailed = resumeRepository.markInboundEmailEventFailed;
    origProcessResume = resumeService.processResume;
    origDownloadDrive = driveService.downloadDriveFile;
    origGoogleGmail = google.gmail;

    if (prisma.companyMember) {
      origFindFirstMember = prisma.companyMember.findFirst;
      prisma.companyMember.findFirst = async () => ({ companyId: "comp_date_range_test" });
    }
    if (prisma.candidateProfile) {
      origUpdateManyProfile = prisma.candidateProfile.updateMany;
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

    resumeService.processResume = async () => {
      processResumeCallCount++;
      return {
        id: "res_proc_" + Date.now(),
        candidateId: "cand_user_01",
        duplicate: false,
      };
    };

    driveService.downloadDriveFile = async () => {
      driveDownloadCallCount++;
      return {
        buffer: Buffer.from(dummyPdfHeader + "Drive Tech Resume"),
        originalname: "DriveResume.pdf",
        mimetype: "application/pdf",
        size: 512,
      };
    };
  });

  afterEach(() => {
    mailboxRepository.findMailboxByUserId = origFindMailbox;
    mailboxRepository.updateMailboxSyncStatus = origUpdateMailbox;
    if (origFindActiveMailboxes) mailboxRepository.findActiveDateRangeMailboxes = origFindActiveMailboxes;
    resumeRepository.findInboundEmailEventsByMessageIds = origFindEvents;
    resumeRepository.createInboundEmailEventSafely = origCreateEvent;
    resumeRepository.updateInboundEmailEvent = origUpdateEvent;
    resumeRepository.markInboundEmailEventCompleted = origMarkCompleted;
    resumeRepository.markInboundEmailEventFailed = origMarkFailed;
    resumeService.processResume = origProcessResume;
    driveService.downloadDriveFile = origDownloadDrive;
    google.gmail = origGoogleGmail;
    if (prisma.companyMember && origFindFirstMember) prisma.companyMember.findFirst = origFindFirstMember;
    if (prisma.candidateProfile && origUpdateManyProfile) prisma.candidateProfile.updateMany = origUpdateManyProfile;
  });

  it("1. Single-day range (From = To = 2026-10-29): processes Oct 29 messages and strictly rejects Oct 28 messages", async () => {
    const oct28Timestamp = new Date("2026-10-28T22:30:00.000Z").getTime();
    const oct29Timestamp = new Date("2026-10-29T14:15:00.000Z").getTime();
    const oct30Timestamp = new Date("2026-10-30T01:00:00.000Z").getTime();

    const messagesById = {
      msg_oct28: {
        id: "msg_oct28",
        internalDate: String(oct28Timestamp),
        payload: {
          headers: [
            { name: "Subject", value: "Senior Backend Engineer Application - Rahul" },
            { name: "From", value: "rahul@example.com" },
          ],
          parts: [
            {
              filename: "Rahul_Backend_Resume.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_oct28", size: 1024 },
            },
          ],
        },
      },
      msg_oct29: {
        id: "msg_oct29",
        internalDate: String(oct29Timestamp),
        payload: {
          headers: [
            { name: "Subject", value: "Frontend React Developer Application - Priya" },
            { name: "From", value: "priya@example.com" },
          ],
          parts: [
            {
              filename: "Priya_React_Resume.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_oct29", size: 2048 },
            },
          ],
        },
      },
      msg_oct30: {
        id: "msg_oct30",
        internalDate: String(oct30Timestamp),
        payload: {
          headers: [
            { name: "Subject", value: "DevOps Engineer Application - Amit" },
            { name: "From", value: "amit@example.com" },
          ],
          parts: [
            {
              filename: "Amit_DevOps_Resume.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_oct30", size: 1024 },
            },
          ],
        },
      },
    };

    let executedQueryStr = null;
    google.gmail = () => ({
      users: {
        messages: {
          list: async (params) => {
            executedQueryStr = params.q;
            return {
              data: {
                messages: [{ id: "msg_oct28" }, { id: "msg_oct29" }, { id: "msg_oct30" }],
              },
            };
          },
          get: async ({ id }) => ({
            data: messagesById[id],
          }),
          attachments: {
            get: async () => {
              attachmentsGetCallCount++;
              return { data: { data: Buffer.from(dummyPdfHeader + "Candidate resume").toString("base64") } };
            },
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_single_day",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      lastSyncedAt: null,
      backfillComplete: true,
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_single_day", 15000, {
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
      timezone: "UTC",
    });

    assert.equal(result.scanned, 3, "Scanned all 3 messages listed by Gmail");
    assert.equal(result.processedResumes, 1, "Only the genuine October 29 resume was processed");
    assert.equal(result.skippedOutOfRange, 2, "October 28 and October 30 messages were rejected as out-of-range");
    assert.equal(attachmentsGetCallCount, 1, "Only 1 binary attachment was downloaded (for October 29 message)");
    assert.equal(processResumeCallCount, 1, "Only 1 resume was parsed");

    // Verify InboundEmailEvent records
    const event28 = eventStore.get("msg_oct28");
    assert.ok(event28);
    assert.equal(event28.status, "COMPLETED");
    assert.equal(event28.errorCode, "SKIPPED_OUT_OF_DATE_RANGE");

    const event30 = eventStore.get("msg_oct30");
    assert.ok(event30);
    assert.equal(event30.status, "COMPLETED");
    assert.equal(event30.errorCode, "SKIPPED_OUT_OF_DATE_RANGE");

    // Query string must align with epoch bounds for 2026-10-29
    assert.ok(executedQueryStr.includes("after:1793231999"), "Gmail query should align with start epoch of 2026-10-29");
  });

  it("2. Multi-day range (2026-10-27 to 2026-10-29): processes window messages and rejects outside messages", async () => {
    const oct26Timestamp = new Date("2026-10-26T23:59:00.000Z").getTime();
    const oct27Timestamp = new Date("2026-10-27T08:00:00.000Z").getTime();
    const oct28Timestamp = new Date("2026-10-28T12:00:00.000Z").getTime();
    const oct29Timestamp = new Date("2026-10-29T20:00:00.000Z").getTime();
    const oct30Timestamp = new Date("2026-10-30T00:01:00.000Z").getTime();

    const messages = {
      msg_oct26: { id: "msg_oct26", internalDate: String(oct26Timestamp) },
      msg_oct27: { id: "msg_oct27", internalDate: String(oct27Timestamp) },
      msg_oct28: { id: "msg_oct28", internalDate: String(oct28Timestamp) },
      msg_oct29: { id: "msg_oct29", internalDate: String(oct29Timestamp) },
      msg_oct30: { id: "msg_oct30", internalDate: String(oct30Timestamp) },
    };

    google.gmail = () => ({
      users: {
        messages: {
          list: async () => ({
            data: {
              messages: Object.keys(messages).map((id) => ({ id })),
            },
          }),
          get: async ({ id }) => ({
            data: {
              ...messages[id],
              payload: {
                headers: [
                  { name: "Subject", value: `Software Engineer Application - ${id}` },
                  { name: "From", value: `${id}@example.com` },
                ],
                parts: [
                  {
                    filename: `${id}_Resume.pdf`,
                    mimeType: "application/pdf",
                    body: { attachmentId: `att_${id}`, size: 1024 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async () => {
              attachmentsGetCallCount++;
              return { data: { data: Buffer.from(dummyPdfHeader + "Valid Resume").toString("base64") } };
            },
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_multi_day",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_multi_day", 15000, {
      fromDate: "2026-10-27",
      toDate: "2026-10-29",
      timezone: "UTC",
    });

    assert.equal(result.scanned, 5, "Scanned all 5 messages");
    assert.equal(result.processedResumes, 3, "Oct 27, Oct 28, and Oct 29 resumes processed");
    assert.equal(result.skippedOutOfRange, 2, "Oct 26 and Oct 30 messages rejected as out-of-range");
    assert.equal(attachmentsGetCallCount, 3, "Only 3 attachments downloaded within the window");
    assert.equal(processResumeCallCount, 3, "Only 3 resumes processed");
  });

  it("3. Boundary timestamps: exact start of day and end of day are INCLUDED; 1ms outside is EXCLUDED", async () => {
    const exactStartMs = new Date("2026-10-29T00:00:00.000Z").getTime();
    const exactEndMs = new Date("2026-10-29T23:59:59.999Z").getTime();
    const before1ms = exactStartMs - 1; // 2026-10-28 23:59:59.999
    const after1ms = exactEndMs + 1;   // 2026-10-30 00:00:00.000

    const boundaryMsgs = {
      msg_before_start: { id: "msg_before_start", internalDate: String(before1ms) },
      msg_exact_start: { id: "msg_exact_start", internalDate: String(exactStartMs) },
      msg_exact_end: { id: "msg_exact_end", internalDate: String(exactEndMs) },
      msg_after_end: { id: "msg_after_end", internalDate: String(after1ms) },
    };

    google.gmail = () => ({
      users: {
        messages: {
          list: async () => ({
            data: {
              messages: Object.keys(boundaryMsgs).map((id) => ({ id })),
            },
          }),
          get: async ({ id }) => ({
            data: {
              ...boundaryMsgs[id],
              payload: {
                headers: [
                  { name: "Subject", value: `Engineer Application - ${id}` },
                  { name: "From", value: `${id}@example.com` },
                ],
                parts: [
                  {
                    filename: `${id}_Resume.pdf`,
                    mimeType: "application/pdf",
                    body: { attachmentId: `att_${id}`, size: 1024 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async () => {
              attachmentsGetCallCount++;
              return { data: { data: Buffer.from(dummyPdfHeader + "Valid Resume").toString("base64") } };
            },
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_boundary",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_boundary", 15000, {
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
      timezone: "UTC",
    });

    assert.equal(result.scanned, 4);
    assert.equal(result.processedResumes, 2, "Exact start and exact end boundaries are processed");
    assert.equal(result.skippedOutOfRange, 2, "1ms before start and 1ms after end are rejected");
    assert.equal(attachmentsGetCallCount, 2);
  });

  it("4. Out-of-range emails cause ZERO attachment downloads, ZERO Drive downloads, and ZERO resume parsing", async () => {
    const oldTimestamp = new Date("2026-10-28T18:00:00.000Z").getTime();

    google.gmail = () => ({
      users: {
        messages: {
          list: async () => ({
            data: { messages: [{ id: "msg_old_with_drive_and_att" }] },
          }),
          get: async () => ({
            data: {
              id: "msg_old_with_drive_and_att",
              internalDate: String(oldTimestamp),
              payload: {
                headers: [
                  { name: "Subject", value: "Senior Architect Profile - Rohit" },
                  { name: "From", value: "rohit@example.com" },
                ],
                body: {
                  data: Buffer.from("Here is my drive link: https://drive.google.com/file/d/1A2B3C4D5E6F/view").toString("base64"),
                },
                parts: [
                  {
                    filename: "Resume_Attachment.docx",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    body: { attachmentId: "att_old", size: 5000 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async () => {
              attachmentsGetCallCount++;
              return { data: { data: Buffer.from("docx_binary").toString("base64") } };
            },
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_zero_download",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_zero_download", 15000, {
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
      timezone: "UTC",
    });

    assert.equal(result.processedResumes, 0);
    assert.equal(result.skippedOutOfRange, 1);
    assert.equal(attachmentsGetCallCount, 0, "Zero direct attachment downloads occurred");
    assert.equal(driveDownloadCallCount, 0, "Zero Drive downloads occurred");
    assert.equal(processResumeCallCount, 0, "Zero resume parsing calls occurred");
  });

  it("5. Checkpoints & pagination: preserves pagination across pages and does not contaminate checkpoint with out-of-range dates", async () => {
    let statusUpdated = null;
    mailboxRepository.updateMailboxSyncStatus = async (userId, data) => {
      statusUpdated = data;
      return {};
    };

    const oct28Timestamp = new Date("2026-10-28T20:00:00.000Z").getTime();
    const oct29Timestamp1 = new Date("2026-10-29T10:00:00.000Z").getTime();
    const oct29Timestamp2 = new Date("2026-10-29T16:00:00.000Z").getTime();

    let listCallCount = 0;
    google.gmail = () => ({
      users: {
        messages: {
          list: async (params) => {
            listCallCount++;
            if (!params.pageToken) {
              return {
                data: {
                  messages: [{ id: "msg_page1_oct28" }, { id: "msg_page1_oct29" }],
                  nextPageToken: "token_page_2",
                },
              };
            }
            return {
              data: {
                messages: [{ id: "msg_page2_oct29" }],
                nextPageToken: null,
              },
            };
          },
          get: async ({ id }) => {
            let timestamp = oct29Timestamp2;
            if (id === "msg_page1_oct28") timestamp = oct28Timestamp;
            else if (id === "msg_page1_oct29") timestamp = oct29Timestamp1;

            return {
              data: {
                id,
                internalDate: String(timestamp),
                payload: {
                  headers: [
                    { name: "Subject", value: `Candidate Application - ${id}` },
                    { name: "From", value: `${id}@example.com` },
                  ],
                  parts: [
                    {
                      filename: `${id}_Resume.pdf`,
                      mimeType: "application/pdf",
                      body: { attachmentId: `att_${id}`, size: 1024 },
                    },
                  ],
                },
              },
            };
          },
          attachments: {
            get: async () => ({
              data: { data: Buffer.from(dummyPdfHeader + "Candidate resume").toString("base64") },
            }),
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_pagination",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
      dateRangeLastSyncedAt: new Date("2026-10-29T00:00:00.000Z"),
    });
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_pagination", 15000, {
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
      timezone: "UTC",
      isFutureDateSync: true,
    });

    assert.equal(listCallCount, 2, "Paging visited both pages");
    assert.equal(result.scanned, 3, "Total 3 messages scanned across 2 pages");
    assert.equal(result.processedResumes, 2, "2 resumes processed from Oct 29");
    assert.equal(result.skippedOutOfRange, 1, "1 resume skipped from Oct 28");

    // Checkpoint must advance to the highest valid in-range timestamp (oct29Timestamp2), NOT oct28
    assert.ok(statusUpdated);
    assert.equal(
      statusUpdated.dateRangeLastSyncedAt.getTime(),
      oct29Timestamp2,
      "Checkpoint updated to highest in-range message timestamp"
    );
  });

  it("6. Automatic sync worker: never regresses into older emails and respects dateRangeSyncFrom", async () => {
    let syncedOptions = null;
    const origSyncMailbox = mailboxService.syncMailboxForUser;

    mailboxRepository.findActiveDateRangeMailboxes = async () => [
      {
        userId: "usr_cron_sync",
        email: "recruiter@example.com",
        dateRangeSyncEnabled: true,
        dateRangeSyncFrom: new Date("2026-10-29T00:00:00.000Z"),
        dateRangeSyncTo: new Date("2026-10-29T23:59:59.999Z"),
        dateRangeLastSyncedAt: new Date("2026-10-29T10:00:00.000Z"),
      },
    ];

    mailboxService.syncMailboxForUser = async (userId, duration, options) => {
      syncedOptions = options;
      return { success: true, processedResumes: 1, skipped: 0, failed: 0 };
    };

    try {
      const workerRes = await processMailboxSync();
      assert.equal(workerRes.synced, 1);
      assert.ok(syncedOptions);

      // Verify that startTimestampMs did NOT regress to October 28
      const oct29StartMs = new Date("2026-10-29T00:00:00.000Z").getTime();
      assert.ok(
        syncedOptions.startTimestampMs >= oct29StartMs,
        `Worker start timestamp (${new Date(syncedOptions.startTimestampMs).toISOString()}) must be >= dateRangeSyncFrom (${new Date(oct29StartMs).toISOString()})`
      );
      assert.equal(syncedOptions.fromDate, "2026-10-29", "Worker fromDate must remain 2026-10-29");
      assert.equal(syncedOptions.toDate, "2026-10-29", "Worker toDate must remain 2026-10-29");
    } finally {
      mailboxService.syncMailboxForUser = origSyncMailbox;
    }
  });

  it("7. Timezone handling: Asia/Kolkata (IST = UTC+5:30) correctly includes local Oct 29 and excludes local Oct 28", async () => {
    // In Asia/Kolkata (UTC+5:30):
    // 2026-10-29 00:00:00 IST = 2026-10-28 18:30:00 UTC
    // 2026-10-29 23:59:59 IST = 2026-10-29 18:29:59 UTC

    // Email A: 2026-10-28 20:00:00 UTC -> 2026-10-29 01:30:00 IST (INCLUDED in Oct 29 IST)
    const emailA_Timestamp = new Date("2026-10-28T20:00:00.000Z").getTime();

    // Email B: 2026-10-28 17:00:00 UTC -> 2026-10-28 22:30:00 IST (EXCLUDED, it was Oct 28 IST)
    const emailB_Timestamp = new Date("2026-10-28T17:00:00.000Z").getTime();

    const tzMessages = {
      msg_tz_include: { id: "msg_tz_include", internalDate: String(emailA_Timestamp) },
      msg_tz_exclude: { id: "msg_tz_exclude", internalDate: String(emailB_Timestamp) },
    };

    google.gmail = () => ({
      users: {
        messages: {
          list: async () => ({
            data: {
              messages: [{ id: "msg_tz_include" }, { id: "msg_tz_exclude" }],
            },
          }),
          get: async ({ id }) => ({
            data: {
              ...tzMessages[id],
              payload: {
                headers: [
                  { name: "Subject", value: `Candidate Application - ${id}` },
                  { name: "From", value: `${id}@example.com` },
                ],
                parts: [
                  {
                    filename: `${id}_Resume.pdf`,
                    mimeType: "application/pdf",
                    body: { attachmentId: `att_${id}`, size: 1024 },
                  },
                ],
              },
            },
          }),
          attachments: {
            get: async () => ({
              data: { data: Buffer.from(dummyPdfHeader + "Candidate resume").toString("base64") },
            }),
          },
        },
      },
    });

    mailboxRepository.findMailboxByUserId = async () => ({
      userId: "usr_tz_test",
      email: "recruiter@example.com",
      refreshToken: "mock-token",
    });
    mailboxRepository.updateMailboxSyncStatus = async () => ({});
    resumeRepository.findInboundEmailEventsByMessageIds = async () => [];

    const result = await mailboxService.syncMailboxForUser("usr_tz_test", 15000, {
      fromDate: "2026-10-29",
      toDate: "2026-10-29",
      timezone: "Asia/Kolkata",
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.processedResumes, 1, "Only Email A (which was 1:30 AM Oct 29 IST) was processed");
    assert.equal(result.skippedOutOfRange, 1, "Email B (which was 10:30 PM Oct 28 IST) was rejected");
  });
});

