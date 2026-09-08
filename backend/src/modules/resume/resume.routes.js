"use strict";

const express = require("express");
const multer = require("multer");

const controller = require("./resume.controller");
const constants = require("./resume.constants");

const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: constants.RESUME_UPLOAD_LIMITS?.files || 1,
    fileSize: constants.MAX_RESUME_FILE_SIZE,
  },

  fileFilter: (req, file, callback) => {
    const originalName = String(file?.originalname || "");
    const extension = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
      : "";

    const allowedExtension =
      constants.ALLOWED_RESUME_EXTENSIONS.includes(extension);

    const allowedMime =
      constants.ALLOWED_RESUME_MIME_TYPES.includes(file?.mimetype);

    if (!allowedExtension || !allowedMime) {
      const error = new Error(
        "Only PDF and DOCX resume files are supported"
      );

      error.code = "UNSUPPORTED_FILE_TYPE";
      error.statusCode = 415;

      return callback(error);
    }

    return callback(null, true);
  },
});

/*
 * HR/SUPER_ADMIN direct resume upload.
 *
 * Candidate self-upload is intentionally NOT wired
 * to this endpoint because direct candidate uploads
 * must derive identity from req.user.id and follow
 * a separate candidate-owned flow.
 */
router.post(
  "/",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN"),
  upload.single(constants.RESUME_FILE_FIELD_NAME),
  controller.uploadResume
);

router.get(
  "/:id",
  requireAuth,
  requireRole("HR", "SUPER_ADMIN", "CANDIDATE"),
  controller.getResumeProcessing
);

/*
 * Inbound Email Webhook Endpoints
 * Provider authentication + payload/attachment limits constitute security boundary.
 * JWT authentication is intentionally NOT applied here.
 */
const {
  verifySnsNotificationSignature,
} = require("./email.extractor.service");

function verifySesSnsSignature(req, res, next) {
  try {
    let payload = req.body;

    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
        req.body = payload;
      } catch {
        // Raw fallback
      }
    }

    if (payload?.Type === "SubscriptionConfirmation") {
      return res.status(200).json({
        success: true,
        message: "SNS SubscriptionConfirmation received",
        subscribeUrl: payload.SubscribeURL || null,
      });
    }

    verifySnsNotificationSignature(payload);
    return next();
  } catch (error) {
    return next(error);
  }
}

router.post(
  "/inbound/sendgrid",
  controller.inboundSendGrid
);

router.post(
  "/inbound/mailgun",
  controller.inboundMailgun
);

router.post(
  "/inbound/ses",
  verifySesSnsSignature,
  controller.inboundSes
);

module.exports = router;



