"use strict";

const ASSESSMENT_RESULT_CONSTANTS = Object.freeze({
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  SORT: {
    DEFAULT_BY: "createdAt",
    DEFAULT_ORDER: "desc",

    ALLOWED_FIELDS: [
      "createdAt",
      "percentage",
      "score",
      "candidateName",
      "candidateEmail",
    ],
  },

  STATUS: {
    PASS: "PASS",
    FAIL: "FAIL",
  },

  ERROR_CODES: {
    RESULT_NOT_FOUND: "ASSESSMENT_RESULT_NOT_FOUND",
    RESULT_ACCESS_DENIED: "ASSESSMENT_RESULT_ACCESS_DENIED",
    INVALID_RESULT_QUERY: "INVALID_ASSESSMENT_RESULT_QUERY",
    RESULT_NOT_READY: "ASSESSMENT_RESULT_NOT_READY",
  },
});

module.exports = {
  ASSESSMENT_RESULT_CONSTANTS,
};
