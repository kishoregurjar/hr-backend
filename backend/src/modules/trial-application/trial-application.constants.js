"use strict";

const TRIAL_APPLICATION_STATUS = {
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

/**
 * Common disposable / temporary email domains that must be strictly rejected
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.block",
  "trashmail.com",
  "trashmail.net",
  "sharklasers.com",
  "getnada.com",
  "yopmail.com",
  "yopmail.net",
  "dispostable.com",
  "burnermail.io",
  "throwawaymail.com",
  "fakemailgenerator.com",
  "mohmal.com",
  "crazymailing.com",
  "tempail.com",
  "generator.email",
  "mytemp.email",
  "dropmail.me",
  "inboxkitten.com",
  "mailcatch.com",
  "maildrop.cc",
  "mailnesia.com",
  "fakeinbox.com",
  "fakemail.net",
  "emailondeck.com",
  "tempr.email",
  "discard.email",
  "discardmail.com",
  "spambog.com",
  "spamex.com",
  "spamfree24.org",
  "kasmail.com",
  "trashmail.de",
]);

/**
 * Free consumer email providers.
 * Legitimate small businesses using these are NOT auto-rejected,
 * but flagged with isBusinessEmail: false for manual administrative review.
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "rediffmail.com",
]);

const OTP_CONFIG = {
  EXPIRY_MINUTES: 10,
  COOLDOWN_SECONDS: 60,
  MAX_ATTEMPTS: 5,
};

const TRIAL_LIMITS = {
  HR_SEATS: 2,
  TOTAL_CANDIDATES: 20,
  MONTHLY_INVITATIONS: 10,
  DURATION_HOURS: 168, // 7 days exactly
  DURATION_DAYS: 7,
};

module.exports = {
  TRIAL_APPLICATION_STATUS,
  DISPOSABLE_EMAIL_DOMAINS,
  FREE_EMAIL_DOMAINS,
  OTP_CONFIG,
  TRIAL_LIMITS,
};

