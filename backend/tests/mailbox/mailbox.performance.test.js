"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { google } = require("googleapis");
const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const resumeService = require("../../src/modules/resume/resume.service");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");

test("Mailbox Sync Performance & Incremental Fetching Suite", async (t) => {
  const TEST_USER_ID = "test-perf-user-123";
  const TEST_EMAIL = "recruiter@example.com";

  // In-memory test store
  let mockMailboxState = {
    userId: TEST_USER_ID,
    email: TEST_EMAIL,
    refreshToken: "mock-refresh-token",
    lastSyncedAt: null,
    backfillComplete: false,
    dateRangeSyncEnabled: false,
  };

  const inboundEventStore = new Map();
  let listQueryRecorded = null;
  let getMessageCallCount = 0;
  let attachmentCallCount = 0;
  let driveDownloadCallCount = 0;
  let resumeProcessCallCount = 0;

  // Save original functions
  const origFindMailbox = mailboxRepository.findMailboxByUserId;
  const origUpdateMailbox = mailboxRepository.updateMailboxSyncStatus;
  const origFindEvents = resumeRepository.findInboundEmailEventsByMessageIds;
  const origCreateEvent = resumeRepository.createInboundEmailEventSafely;
  const origUpdateEvent = resumeRepository.updateInboundEmailEvent;
  const origMarkCompleted = resumeRepository.markInboundEmailEventCompleted;
  const origMarkFailed = resumeRepository.markInboundEmailEventFailed;
  const origFindOldestFailed = resumeRepository.findOldestFailedInboundEvent;
  const origCountUnrecovered = resumeRepository.countUnrecoveredFailedInboundEvents;
  const origProcessResume = resumeService.processResume;
  const origDownloadDrive = driveService.downloadDriveFile;
  const origGmail = google.gmail;
  const origFindFirstMember = prisma.companyMember.findFirst;
  const origFindFirstEvent = prisma.inboundEmailEvent.findFirst;
  const origUpdateManyProfile = prisma.candidateProfile.updateMany;

  // Mock messages database for Gmail
  let mockGmailMessages = [];
  let driveFailures = new Set();

  t.beforeEach(() => {
    getMessageCallCount = 0;
    attachmentCallCount = 0;
    driveDownloadCallCount = 0;
    resumeProcessCallCount = 0;
    listQueryRecorded = null;
    driveFailures.clear();

    mailboxRepository.findMailboxByUserId = async (uid) => {
      if (uid === TEST_USER_ID) return { ...mockMailboxState };
      return null;
    };

    mailboxRepository.updateMailboxSyncStatus = async (uid, updates) => {
      mockMailboxState = { ...mockMailboxState, ...updates };
      return mockMailboxState;
    };

    resumeRepository.findInboundEmailEventsByMessageIds = async (provider, msgIds) => {
      const results = [];
      for (const id of msgIds) {
        if (inboundEventStore.has(id)) {
          results.push(inboundEventStore.get(id));
        }
      }
      return results;
    };

    resumeRepository.createInboundEmailEventSafely = async (data) => {
      if (inboundEventStore.has(data.providerMessageId)) {
        return inboundEventStore.get(data.providerMessageId);
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
      inboundEventStore.set(data.providerMessageId, event);
      return event;
    };

    resumeRepository.updateInboundEmailEvent = async (id, data) => {
      for (const [key, val] of inboundEventStore.entries()) {
        if (val.id === id) {
          const updated = { ...val, ...data };
          inboundEventStore.set(key, updated);
          return updated;
        }
      }
      return null;
    };

    resumeRepository.markInboundEmailEventCompleted = async (id, resId) => {
      for (const [key, val] of inboundEventStore.entries()) {
        if (val.id === id) {
          const updated = {
            ...val,
            status: "COMPLETED",
            resumeProcessingId: resId,
            completedAt: new Date(),
          };
          inboundEventStore.set(key, updated);
          return updated;
        }
      }
      return null;
    };

    resumeRepository.markInboundEmailEventFailed = async (id, code, msg) => {
      for (const [key, val] of inboundEventStore.entries()) {
        if (val.id === id) {
          const updated = {
            ...val,
            status: "FAILED",
            errorCode: code,
            errorMessage: msg,
          };
          inboundEventStore.set(key, updated);
          return updated;
        }
      }
      return null;
    };

    resumeRepository.findOldestFailedInboundEvent = async (email) => {
      let oldest = null;
      for (const evt of inboundEventStore.values()) {
        if (evt.status === "FAILED" && evt.errorCode !== "PERMANENT_FAILURE") {
          if (!oldest || evt.createdAt < oldest.createdAt) {
            oldest = evt;
          }
        }
      }
      return oldest;
    };

    resumeRepository.countUnrecoveredFailedInboundEvents = async (email) => {
      let count = 0;
      for (const evt of inboundEventStore.values()) {
        if (evt.status === "FAILED" && evt.errorCode !== "PERMANENT_FAILURE") {
          count++;
        }
      }
      return count;
    };

    resumeService.processResume = async (params) => {
      resumeProcessCallCount++;
      return {
        id: "res_" + Math.random().toString(36).substring(7),
        duplicate: false,
        candidateId: "cand_123",
      };
    };

    driveService.downloadDriveFile = async ({ fileId }) => {
      driveDownloadCallCount++;
      if (driveFailures.has(fileId)) {
        const err = new Error("Google Drive access denied");
        err.code = "DRIVE_PERMISSION_DENIED";
        err.status = 403;
        throw err;
      }
      return {
        buffer: Buffer.from("%PDF-1.4 test resume buffer"),
        originalname: `drive_resume_${fileId}.pdf`,
        mimetype: "application/pdf",
        size: 1024,
        fileId,
      };
    };

    prisma.companyMember.findFirst = async () => ({ companyId: "test-company-1" });
    prisma.inboundEmailEvent.findFirst = async (query) => {
      if (query?.where?.status === "FAILED") {
        for (const evt of inboundEventStore.values()) {
          if (evt.status === "FAILED") return evt;
        }
      }
      return null;
    };
    prisma.candidateProfile.updateMany = async () => ({ count: 1 });

    google.gmail = () => ({
      users: {
        messages: {
          list: async (params) => {
            listQueryRecorded = params.q;
            return {
              data: {
                messages: mockGmailMessages.map((m) => ({ id: m.id, threadId: m.threadId })),
                nextPageToken: null,
              },
            };
          },
          get: async (params) => {
            getMessageCallCount++;
            const found = mockGmailMessages.find((m) => m.id === params.id);
            if (!found) throw new Error("Message not found in mock: " + params.id);
            return { data: found };
          },
          attachments: {
            get: async () => {
              attachmentCallCount++;
              return {
                data: {
                  data: Buffer.from("%PDF-1.4 test binary").toString("base64"),
                },
              };
            },
          },
        },
      },
    });
  });

  t.after(() => {
    // Restore original functions
    mailboxRepository.findMailboxByUserId = origFindMailbox;
    mailboxRepository.updateMailboxSyncStatus = origUpdateMailbox;
    resumeRepository.findInboundEmailEventsByMessageIds = origFindEvents;
    resumeRepository.createInboundEmailEventSafely = origCreateEvent;
    resumeRepository.updateInboundEmailEvent = origUpdateEvent;
    resumeRepository.markInboundEmailEventCompleted = origMarkCompleted;
    resumeRepository.markInboundEmailEventFailed = origMarkFailed;
    resumeRepository.findOldestFailedInboundEvent = origFindOldestFailed;
    resumeRepository.countUnrecoveredFailedInboundEvents = origCountUnrecovered;
    resumeService.processResume = origProcessResume;
    driveService.downloadDriveFile = origDownloadDrive;
    google.gmail = origGmail;
    prisma.companyMember.findFirst = origFindFirstMember;
    prisma.inboundEmailEvent.findFirst = origFindFirstEvent;
    prisma.candidateProfile.updateMany = origUpdateManyProfile;
  });

  // TEST 1: First sync with new resume emails
  await t.test("Case 1: First sync with new resume emails ingests resumes and sets checkpoint", async () => {
    mockMailboxState.lastSyncedAt = null;
    mockMailboxState.backfillComplete = false;
    inboundEventStore.clear();

    const dateNow = Date.now();
    mockGmailMessages = [
      {
        id: "msg_1",
        threadId: "th_1",
        internalDate: String(dateNow - 5000),
        payload: {
          headers: [
            { name: "Subject", value: "Application: Software Engineer" },
            { name: "From", value: "Candidate One <cand1@example.com>" },
          ],
          parts: [
            {
              filename: "cand1_cv.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_1", size: 5000 },
            },
          ],
        },
      },
      {
        id: "msg_2",
        threadId: "th_2",
        internalDate: String(dateNow - 2000),
        payload: {
          headers: [
            { name: "Subject", value: "Resume Submission" },
            { name: "From", value: "Candidate Two <cand2@example.com>" },
          ],
          parts: [
            {
              filename: "cand2_resume.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              body: { attachmentId: "att_2", size: 6000 },
            },
          ],
        },
      },
    ];

    const result = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(result.success, true);
    assert.equal(result.scanned, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.processedResumes, 2);
    assert.equal(result.failed, 0);
    assert.ok(mockMailboxState.lastSyncedAt instanceof Date);
    assert.equal(mockMailboxState.backfillComplete, true);
    assert.equal(resumeProcessCallCount, 2);
    assert.equal(inboundEventStore.get("msg_1")?.status, "COMPLETED");
    assert.equal(inboundEventStore.get("msg_2")?.status, "COMPLETED");
  });

  // TEST 2: Immediate second sync with no new emails
  await t.test("Case 2: Immediate second sync with no new emails skips completed and runs fast", async () => {
    // Mailbox has existing checkpoint from Case 1
    assert.ok(mockMailboxState.lastSyncedAt);

    // Gmail returns the same messages because of the 60s overlap safety buffer
    const result = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(result.success, true);
    assert.equal(result.scanned, 2);
    assert.equal(result.skipped, 2); // Both skipped instantly!
    assert.equal(result.processedResumes, 0);
    assert.equal(result.failed, 0);
    assert.equal(getMessageCallCount, 0, "No gmail.users.messages.get calls should be made for completed emails");
    assert.equal(attachmentCallCount, 0, "No attachments downloaded");
    assert.equal(resumeProcessCallCount, 0, "No parsing performed");
  });

  // TEST 3: Sync with one new email and several previously completed emails
  await t.test("Case 3: Sync with one new email + completed emails only processes the new email", async () => {
    const newMsgTime = Date.now();
    mockGmailMessages.push({
      id: "msg_3",
      threadId: "th_3",
      internalDate: String(newMsgTime),
      payload: {
        headers: [
          { name: "Subject", value: "Senior Developer Application" },
          { name: "From", value: "Candidate Three <cand3@example.com>" },
        ],
        parts: [
          {
            filename: "cand3_resume.pdf",
            mimeType: "application/pdf",
            body: { attachmentId: "att_3", size: 4500 },
          },
        ],
      },
    });

    const result = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(result.success, true);
    assert.equal(result.scanned, 3);
    assert.equal(result.skipped, 2); // msg_1 and msg_2 skipped
    assert.equal(result.processedResumes, 1); // Only msg_3 processed
    assert.equal(getMessageCallCount, 1, "Only msg_3 should have been fetched");
    assert.equal(attachmentCallCount, 1, "Only att_3 should have been downloaded");
    assert.equal(resumeProcessCallCount, 1);
    assert.equal(inboundEventStore.get("msg_3")?.status, "COMPLETED");
  });

  // TEST 4: Sync with failed Drive downloads that should retry
  await t.test("Case 4: Failed Drive download marks event FAILED and does not advance checkpoint past it", async () => {
    const failedDriveId = "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t";
    driveFailures.add(failedDriveId);

    const failTime = Date.now() + 5000;
    const initialCheckpoint = mockMailboxState.lastSyncedAt.getTime();

    mockGmailMessages = [
      {
        id: "msg_drive_fail",
        threadId: "th_fail",
        internalDate: String(failTime),
        payload: {
          headers: [
            { name: "Subject", value: "Drive Resume Application" },
            { name: "From", value: "Drive Candidate <drivecand@example.com>" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(`https://drive.google.com/file/d/${failedDriveId}/view`).toString("base64url"),
              },
            },
          ],
        },
      },
    ];

    const result = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(result.success, true);
    assert.equal(result.failed, 1);
    assert.equal(result.processedResumes, 0);

    const event = inboundEventStore.get("msg_drive_fail");
    assert.equal(event?.status, "FAILED");
    assert.equal(event?.errorCode, "DRIVE_PERMISSION_DENIED");

    // Checkpoint must NOT advance past the failed message!
    assert.ok(
      mockMailboxState.lastSyncedAt.getTime() <= failTime,
      "Checkpoint should be safely capped before or at failure time"
    );

    // Verify retry on subsequent sync when drive access is restored:
    driveFailures.clear();
    const retryResult = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(retryResult.failed, 0);
    assert.equal(retryResult.processedResumes, 1);
    assert.equal(inboundEventStore.get("msg_drive_fail")?.status, "COMPLETED");
  });

  // TEST 5: An email containing multiple resumes (and partial failure accounting)
  await t.test("Case 5: Multi-resume email with partial failure is marked FAILED so remaining resume is retried", async () => {
    const partialDriveId = "1PartialDriveFileId99999999999";
    driveFailures.add(partialDriveId);

    mockGmailMessages = [
      {
        id: "msg_multi",
        threadId: "th_multi",
        internalDate: String(Date.now() + 10000),
        payload: {
          headers: [
            { name: "Subject", value: "Two Resumes Attached" },
            { name: "From", value: "Multi Sender <multi@example.com>" },
          ],
          parts: [
            {
              filename: "first_resume.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_multi_1", size: 4000 },
            },
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(`https://drive.google.com/file/d/${partialDriveId}/view`).toString("base64url"),
              },
            },
          ],
        },
      },
    ];

    const result = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(result.success, true);
    assert.equal(result.processedResumes, 1, "First resume succeeded");
    assert.equal(result.failed, 1, "Email had a partial failure");

    const multiEvent = inboundEventStore.get("msg_multi");
    assert.equal(multiEvent?.status, "FAILED", "Partial failure must mark event FAILED, not COMPLETED");
    assert.equal(multiEvent?.errorCode, "PARTIAL_ATTACHMENT_FAILURE");
    assert.ok(multiEvent?.errorMessage.includes("1 of 2 resumes succeeded"));

    // Now restore drive access and retry:
    driveFailures.clear();
    const retryResult = await mailboxService.syncMailboxForUser(TEST_USER_ID);

    assert.equal(retryResult.failed, 0);
    assert.equal(inboundEventStore.get("msg_multi")?.status, "COMPLETED");
  });

  // TEST 6: Two sync requests triggered close together
  await t.test("Case 6: Two concurrent sync requests for the same user rejects the second with 409", async () => {
    let unblockFirst;
    const holdPromise = new Promise((resolve) => {
      unblockFirst = resolve;
    });

    // Make processResume hang until holdPromise resolves
    resumeService.processResume = async () => {
      await holdPromise;
      return { id: "res_async", duplicate: false };
    };

    mockGmailMessages = [
      {
        id: "msg_slow",
        threadId: "th_slow",
        internalDate: String(Date.now()),
        payload: {
          headers: [{ name: "Subject", value: "Slow" }, { name: "From", value: "test@example.com" }],
          parts: [{ filename: "slow.pdf", mimeType: "application/pdf", body: { attachmentId: "slow_1", size: 100 } }],
        },
      },
    ];

    const sync1Promise = mailboxService.syncMailboxForUser(TEST_USER_ID);

    // Immediate second call while sync1 is in progress
    await assert.rejects(
      async () => {
        await mailboxService.syncMailboxForUser(TEST_USER_ID);
      },
      (err) => {
        assert.equal(err.code, "MAILBOX_SYNC_IN_PROGRESS");
        assert.equal(err.statusCode || err.status, 409);
        return true;
      }
    );

    // Unblock first sync and wait for it to completely finish
    unblockFirst();
    const sync1Result = await sync1Promise;
    assert.equal(sync1Result.success, true);
  });

  // TEST 7: Failed or interrupted sync followed by retry
  await t.test("Case 7: Interrupted or aborted sync does not corrupt checkpoint and retries cleanly", async () => {
    const errorMsgId = "msg_network_error";
    let shouldThrow = true;

    mockGmailMessages = [
      {
        id: errorMsgId,
        threadId: "th_err",
        internalDate: String(Date.now() + 20000),
        payload: {
          headers: [{ name: "Subject", value: "Crash test" }, { name: "From", value: "crash@example.com" }],
          parts: [{ filename: "crash.pdf", mimeType: "application/pdf", body: { attachmentId: "crash_1", size: 100 } }],
        },
      },
    ];

    resumeService.processResume = async () => {
      if (shouldThrow) {
        throw new Error("Simulated network timeout");
      }
      return { id: "res_recovered", duplicate: false };
    };

    const run1 = await mailboxService.syncMailboxForUser(TEST_USER_ID);
    assert.equal(run1.failed, 1);
    assert.equal(inboundEventStore.get(errorMsgId)?.status, "FAILED");

    // Second run: recovery
    shouldThrow = false;
    const run2 = await mailboxService.syncMailboxForUser(TEST_USER_ID);
    assert.equal(run2.failed, 0);
    assert.equal(run2.processedResumes, 1);
    assert.equal(inboundEventStore.get(errorMsgId)?.status, "COMPLETED");
  });
});
