"use strict";

const RATE_LIMIT_POLICIES = Object.freeze({
  GLOBAL: {
    windowSeconds: 60,
    maxRequests: 120,
  },

  OTP_SEND: {
    windowSeconds: 60,
    maxRequests: 1,
  },

  OTP_VERIFY: {
    windowSeconds: 300,
    maxRequests: 5,
  },

  START_ATTEMPT: {
    windowSeconds: 60,
    maxRequests: 5,
  },

  SAVE_ANSWER: {
    windowSeconds: 60,
    maxRequests: 120,
  },

  SUBMIT_ATTEMPT: {
    windowSeconds: 60,
    maxRequests: 5,
  },

  ADMIN_API: {
    windowSeconds: 60,
    maxRequests: 120,
  },

  WEBHOOK: {
    windowSeconds: 60,
    maxRequests: 300,
  },
});

module.exports = {
  RATE_LIMIT_POLICIES,
};
