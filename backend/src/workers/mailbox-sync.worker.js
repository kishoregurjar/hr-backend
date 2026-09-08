"use strict";

const repository = require("../modules/mailbox/mailbox.repository");
const mailboxService = require("../modules/mailbox/mailbox.service");

async function processMailboxSync() {
  const activeMailboxes = await repository.findActiveMailboxes();
  if (!activeMailboxes || activeMailboxes.length === 0) {
    return { synced: 0 };
  }

  let successCount = 0;
  for (const mailbox of activeMailboxes) {
    try {
      await mailboxService.syncMailboxForUser(mailbox.userId);
      successCount++;
    } catch (error) {
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
