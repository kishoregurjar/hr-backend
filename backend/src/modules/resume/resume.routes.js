"use strict";

const express = require("express");
const multer = require("multer");

const { MAX_RESUME_SIZE_BYTES } = require("./resume.constants");
const { validateResumeFile } = require("./resume.validator");
const { createResumeRepository } = require("./resume.repository");
const { createResumeService } = require("./resume.service");
const { createResumeController } = require("./resume.controller");
const { prisma } = require("../../config/prisma");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RESUME_SIZE_BYTES,
    files: 1,
    fields: 10,
    parts: 12,
  },
  fileFilter(req, file, callback) {
    try {
      if (!file.originalname || !file.mimetype) {
        return callback(new Error("RESUME_FILE_TYPE_NOT_ALLOWED"));
      }

      return callback(null, true);
    } catch (error) {
      return callback(error);
    }
  },
});

const repository = createResumeRepository({ prisma });
const service = createResumeService({ repository });
const controller = createResumeController({ service });

router.post(
  "/parse-upload",
  upload.single("resume"),
  (req, res, next) => {
    try {
      validateResumeFile(req.file);
      return next();
    } catch (error) {
      return next(error);
    }
  },
  controller.parseUpload
);

router.post(
  "/upload",
  upload.single("resume"),
  (req, res, next) => {
    try {
      validateResumeFile(req.file);
      return next();
    } catch (error) {
      return next(error);
    }
  },
  controller.upload
);

router.post("/inbound-email", controller.inboundEmail);

router.get("/:candidateId", controller.getCandidateResume);

module.exports = router;
