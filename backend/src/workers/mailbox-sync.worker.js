"use strict";

const repository = require("../modules/mailbox/mailbox.repository");
const mailboxService = require("../modules/mailbox/mailbox.service");

async function processMailboxSync() {
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

      const minAllowedTime = mailbox.dateRangeSyncFrom ? mailbox.dateRangeSyncFrom.getTime() : 0;
      let effectiveFromMs = minAllowedTime;
      if (mailbox.dateRangeLastSyncedAt) {
        // Safe 60-second overlap buffer for clock skew, but NEVER regress prior to dateRangeSyncFrom
        effectiveFromMs = Math.max(minAllowedTime, mailbox.dateRangeLastSyncedAt.getTime() - 60000);
      }

      const toTimeMs = mailbox.dateRangeSyncTo ? mailbox.dateRangeSyncTo.getTime() : Date.now();
      const fromDate = new Date(effectiveFromMs).toISOString().split("T")[0];
      const toDate = new Date(toTimeMs).toISOString().split("T")[0];

      let dateRangePageToken = null;
      while (true) {
        const dateRangeOptions = {
          fromDate,
          toDate,
          startTimestampMs: effectiveFromMs,
          endTimestampMs: toTimeMs,
          dateRangeSyncFrom: mailbox.dateRangeSyncFrom,
          dateRangeSyncTo: mailbox.dateRangeSyncTo,
          pageToken: dateRangePageToken,
          isCronDateRangeSync: true,
        };

        const syncRes = await mailboxService.syncMailboxForUser(mailbox.userId, 180000, dateRangeOptions);
        dateRangePageToken = syncRes.nextPageToken || null;
        if (!dateRangePageToken) {
          break;
        }
      }

      successCount++;
    } catch (error) {
      if (error?.code === "MAILBOX_SYNC_IN_PROGRESS") {
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
