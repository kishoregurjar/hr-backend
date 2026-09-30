"use strict";

const express = require("express");
const router = express.Router();
const controller = require("./public-contact.controller");
const { createRateLimiter } = require("../../middleware/rate-limit.middleware");

const publicContactLimiter = createRateLimiter({
  namespace: "public-contact",
  limit: 10,
  windowSeconds: 15 * 60, // 10 requests per 15 minutes
  keyGenerator: (req) => req.ip,
  message: "Too many contact inquiries from this IP. Please try again later.",
});

/**
 * Public Contact Request Routes
 * Base Path: /api/v1/contact
 */

// Submit a new public contact inquiry
router.post("/", publicContactLimiter, controller.submitInquiry);

module.exports = router;
