"use strict";

const ASSESSMENT_ANALYTICS_CONSTANTS = Object.freeze({
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  SCORE_DISTRIBUTION: [
    { key: "0_20", min: 0, max: 20, label: "0-20" },
    { key: "21_40", min: 21, max: 40, label: "21-40" },
    { key: "41_60", min: 41, max: 60, label: "41-60" },
    { key: "61_80", min: 61, max: 80, label: "61-80" },
    { key: "81_100", min: 81, max: 100, label: "81-100" },
  ],

  SORT: {
    DEFAULT_BY: "accuracy",
    DEFAULT_ORDER: "desc",

    ALLOWED_FIELDS: [
      "accuracy",
      "attempts",
      "correct",
      "incorrect",
      "unanswered",
      "averageMarks",
      "questionSequence",
    ],
  },

  ERROR_CODES: {
    ASSESSMENT_NOT_FOUND: "ASSESSMENT_NOT_FOUND",
    ANALYTICS_ACCESS_DENIED: "ASSESSMENT_ANALYTICS_ACCESS_DENIED",
    INVALID_ANALYTICS_QUERY: "INVALID_ASSESSMENT_ANALYTICS_QUERY",
  },
});

module.exports = {
  ASSESSMENT_ANALYTICS_CONSTANTS,
};
