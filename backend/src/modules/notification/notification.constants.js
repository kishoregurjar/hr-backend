"use strict";

const NOTIFICATION_TYPES = Object.freeze({
  ASSESSMENT: "ASSESSMENT",
  PROCTORING: "PROCTORING",
  CANDIDATE: "CANDIDATE",
  TEAM: "TEAM",
  SUPPORT: "SUPPORT",
  SYSTEM: "SYSTEM",
});

const NOTIFICATION_PRIORITIES = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const NOTIFICATION_CACHE = Object.freeze({
  UNREAD_COUNT_KEY: (userId) => `notification:unread:${userId}`,
  TTL_SECONDS: 300, // 5 minutes cache
});

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_CACHE,
};
