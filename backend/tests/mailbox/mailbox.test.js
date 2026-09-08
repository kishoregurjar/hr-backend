"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");

test("Mailbox Module Unit Suite", async (t) => {
  await t.test("getAuthUrl generates valid Google OAuth URL", () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:5000/api/v1/mailbox/google/callback";

    const url = mailboxService.getAuthUrl("user-123");
    assert.ok(url.includes("accounts.google.com"));
    assert.ok(url.includes("user-123"));
  });

  await t.test(
    "getMailboxStatus returns unconnected state for user without mailbox",
    async () => {
      const status =
        await mailboxService.getMailboxStatus("non-existent-user-id");
      assert.equal(status.connected, false);
      assert.equal(status.email, null);
    }
  );
});
