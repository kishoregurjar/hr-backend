"use strict";

const repository = require("../modules/mailbox/mailbox.repository");
const mailboxService = require("../modules/mailbox/mailbox.service");
const env = require("../config/env");

async function processMailboxSync() {
  if (!env.featureFlags?.mailboxSyncEnabled) {
    console.info({
      type: "MAILBOX_SYNC_DISABLED",
      message: "Background mailbox sync is disabled by feature flag kill switch.",
    });
    return { synced: 0, reason: "FEATURE_DISABLED" };
  }

  const activeMailboxes = await repository.findActiveDateRangeMailboxes();
  if (!activeMailboxes || activeMailboxes.length === 0) {
    return { synced: 0 };
  }

  let successCount = 0;
  for (const mailbox of activeMailboxes) {
    try {
      if (Date.now() > mailbox.dateRangeSyncTo.getTime()) {
        await repository.updateMailboxSyncStatus(mailbox.userId, { dateRangeSyncEnabled: false });
        continue;
      }

      if (!mailbox.companyId) {
        console.warn({
          type: "MAILBOX_SYNC_DEFERRED",
          userId: mailbox.userId,
          message: "Background scheduled sync deferred: UserMailbox model lacks persisted companyId. Awaiting Phase 2 schema expansion.",
        });
        continue;
      }

      const fromTime = mailbox.dateRangeLastSyncedAt ? mailbox.dateRangeLastSyncedAt.getTime() - (24 * 60 * 60 * 1000) : mailbox.dateRangeSyncFrom.getTime();
      const fromDate = new Date(fromTime).toISOString().split("T")[0];
      const toDate = mailbox.dateRangeSyncTo.toISOString().split("T")[0];

      let dateRangePageToken = null;
      while (true) {
        const dateRangeOptions = {
          fromDate,
          toDate,
          pageToken: dateRangePageToken,
          isCronDateRangeSync: true
        };

        const syncRes = await mailboxService.syncMailboxForUser(mailbox.userId, 180000, dateRangeOptions, mailbox.companyId);
        dateRangePageToken = syncRes.nextPageToken || null;
        if (!dateRangePageToken) {
          break;
        }
      }

      successCount++;
    } catch (error) {
      if (error?.code === "MAILBOX_SYNC_IN_PROGRESS" || error?.code === "COMPANY_CONTEXT_REQUIRED") {
        continue;
      }
      console.error({
        type: "MAILBOX_SYNC_WORKER_ERROR",
        userId: mailbox.userId,
        email: mailbox.email,
        error: error.message,
      });
    }
  }

  return { synced: successCount, total: activeMailboxes.length };
}

module.exports = {
  processMailboxSync,
};
