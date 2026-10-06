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
