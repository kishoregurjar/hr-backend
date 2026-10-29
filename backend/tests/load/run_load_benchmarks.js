"use strict";

const { runLoadBatch, createInMemoryDb, installDbMocks, generateTestBatch, installGoogleClientMocks, createUniqueValidPdf } = require("./mailbox.load.test");
const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const crypto = require("crypto");

async function main() {
  console.log("===============================================================================");
  console.log("HIREQUEST MAILBOX RESUME INGESTION LOAD & RELIABILITY BENCHMARK SUITE");
  console.log("Isolated test harness — 0 production access — Real parser & state validation");
  console.log("Testing batch sizes: 50, 100, 200, 300, 400, 600 eligible resumes");
  console.log("===============================================================================\n");

  const batchSizes = [50, 100, 200, 300, 400, 600];
  const results = [];

  for (const count of batchSizes) {
    console.log(`>>> Running Benchmark: ${count} Resumes Batch...`);
    const result = await runLoadBatch(count);
    results.push(result);

    console.log(`[Batch ${count}] Duration: ${result.durationMs}ms | Throughput: ${result.resumesPerMinute} resumes/min | SyncRounds: ${result.syncRounds}`);
    console.log(`  Events: Total=${result.events.total}, Completed=${result.events.completed}, Failed=${result.events.failed}, Stuck=${result.events.stuckProcessing}`);
    console.log(`  Resumes: Discovered=${result.resumes.total}, Completed=${result.resumes.completed}, Failed=${result.resumes.failed}, Stuck=${result.resumes.stuckProcessing}`);
    console.log(`  Candidates Created: ${result.candidates.totalCreated} | Profiles Ensured: ${result.candidates.profilesEnsured} | JobApplications: ${result.applications.totalCreated}`);
    console.log(`  Memory: HeapUsed=${result.heapUsedMb}MB | RSS=${result.rssMb}MB | CPU: User=${result.cpuUserMs}ms, Sys=${result.cpuSystemMs}ms`);
    console.log(`  Failures by Category:`, result.failuresByCategory);
    console.log("-------------------------------------------------------------------------------\n");
  }

  // Phase 4: Recovery & Restart Verification
  console.log("===============================================================================");
  console.log("PHASE 4: SIMULATED BACKEND RESTART & TRANSIENT FAILURE RECOVERY TEST");
  console.log("===============================================================================");

  const recoveryStore = createInMemoryDb();
  const uninstallDb = installDbMocks(recoveryStore);
  const TEST_USER_ID = "usr_recruiter_facebook";
  recoveryStore.mailboxes.set(TEST_USER_ID, {
    userId: TEST_USER_ID,
    email: "vs2917239@gmail.com",
    refreshToken: "mock-refresh-token",
    lastSyncedAt: null,
    backfillComplete: false,
  });

  // Generate 100 cases with 3 simulated transient failures
  const transientAttempts = new Map();
  const recoveryFixture = generateTestBatch(100, {
    simulatedFailures: ["att_msg_load_0001_1", "att_msg_load_0002_1", "att_msg_load_0003_1"],
  });
  const uninstallGoogle = installGoogleClientMocks({
    ...recoveryFixture,
    transientFailAttempts: transientAttempts,
  });

  console.log("\n[Step 1] Initial Sync with 3 Transient Attachment Failures...");
  const sync1 = await mailboxService.syncMailboxForUser(TEST_USER_ID, 60000);
  console.log(`  Sync 1 Complete: scanned=${sync1.scanned}, processed=${sync1.processedResumes}, failed=${sync1.failed}`);

  const failedEventsAfterSync1 = Array.from(recoveryStore.inboundEmailEvents.values()).filter((e) => e.status === "FAILED");
  console.log(`  Verified FAILED events in DB: ${failedEventsAfterSync1.length} (Expected: 3)`);

  console.log("\n[Step 2] Simulating Backend Process Crash mid-processing with stuck PROCESSING record...");
  // Inject a simulated stuck record: an event and resume record left in PROCESSING state from an interrupted process
  const stuckMsgId = "msg_load_stuck_0999";
  const stuckBuffer = createUniqueValidPdf("stuck_recovery_candidate");
  recoveryFixture.attachmentMap.set("att_stuck_0999_1", stuckBuffer);
  recoveryFixture.messages.unshift({
    id: stuckMsgId,
    internalDate: String(Date.now() - 3600000),
    payload: {
      headers: [
        { name: "Subject", value: "[JOB: DEV-400] Crashed Application Recovery Test" },
        { name: "From", value: "stuck.candidate@example.com" },
      ],
      parts: [
        {
          filename: "stuck_resume.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "att_stuck_0999_1", size: stuckBuffer.length },
        },
      ],
    },
  });

  recoveryStore.inboundEmailEvents.set(stuckMsgId, {
    id: "evt_stuck_0999",
    provider: "google_mailbox",
    providerMessageId: stuckMsgId,
    recipientEmail: "vs2917239@gmail.com",
    status: "PROCESSING", // stuck from simulated crash
    createdAt: new Date(Date.now() - 3600000),
    receivedAt: new Date(Date.now() - 3600000),
  });

  const stuckHashInput = Buffer.concat([stuckBuffer, Buffer.from(stuckMsgId)]);
  const stuckFileHash = crypto.createHash("sha256").update(stuckHashInput).digest("hex");
  recoveryStore.resumeProcessing.set(stuckFileHash, {
    id: "rp_stuck_0999",
    fileHash: stuckFileHash,
    fileName: "stuck_resume.pdf",
    fileType: "PDF",
    mimeType: "application/pdf",
    fileSize: stuckBuffer.length,
    storageKey: `resumes/${stuckFileHash.slice(0, 2)}/${stuckFileHash}.pdf`,
    status: "PROCESSING", // stuck job
    updatedAt: new Date(Date.now() - 3600000), // stale by 1 hour
    createdAt: new Date(Date.now() - 3600000),
  });

  console.log("\n[Step 3] Running Subsequent Sync (Retry & Self-Healing)...");
  // The transient failure condition has cleared on attempt 2 (simulated retry)
  const sync2 = await mailboxService.syncMailboxForUser(TEST_USER_ID, 60000);
  console.log(`  Sync 2 Complete: scanned=${sync2.scanned}, processed=${sync2.processedResumes}, failed=${sync2.failed}, skipped=${sync2.skipped}`);

  const finalFailedEvents = Array.from(recoveryStore.inboundEmailEvents.values()).filter((e) => e.status === "FAILED");
  const finalCompletedEvents = Array.from(recoveryStore.inboundEmailEvents.values()).filter((e) => e.status === "COMPLETED");
  const stuckResumeRecord = recoveryStore.resumeProcessing.get(stuckFileHash);

  console.log(`  Post-Recovery State:`);
  console.log(`    Successfully Recovered & Completed Events: ${finalCompletedEvents.length}`);
  console.log(`    Stuck Job Recovered from PROCESSING: ${stuckResumeRecord?.status === "COMPLETED" || stuckResumeRecord?.status === "REVIEW_REQUIRED" ? `YES (Status: ${stuckResumeRecord?.status})` : `NO (Status: ${stuckResumeRecord?.status})`}`);
  console.log(`    Remaining Failed Events: ${finalFailedEvents.length}`);
  console.log(`    Duplicate Candidate Insert Attempts: ${recoveryStore.duplicateCandidateInsertAttempts}`);
  console.log(`    Unique Constraint Violations: ${recoveryStore.uniqueConstraintErrors}`);

  uninstallGoogle();
  uninstallDb();

  console.log("\n===============================================================================");
  console.log("BENCHMARK SUMMARY RESULTS TABLE");
  console.log("===============================================================================");
  console.table(
    results.map((r) => ({
      "Cases": r.caseCount,
      "Sync Rounds": r.syncRounds,
      "Duration (s)": (r.durationMs / 1000).toFixed(2),
      "Throughput (res/min)": r.resumesPerMinute,
      "Discovered": r.resumes.total,
      "Completed": r.resumes.completed,
      "Failed": r.resumes.failed,
      "Stuck in PROCESSING": r.resumes.stuckProcessing,
      "Heap Peak (MB)": r.heapUsedMb,
      "RSS (MB)": r.rssMb,
      "CPU Time (s)": ((r.cpuUserMs + r.cpuSystemMs) / 1000).toFixed(2),
    }))
  );
}

main().catch(console.error);

