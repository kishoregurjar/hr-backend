"use strict";

const resumeService = require("./resume.service");
const {
  validateDirectUploadQuery,
} = require("./resume.validator");

function getAuthenticatedUser(req) {
  if (!req.user || !req.user.id) {
    const error = new Error("Authentication required");
    error.code = "AUTHENTICATION_REQUIRED";
    error.statusCode = 401;
    throw error;
  }

  return req.user;
}

async function uploadResume(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);

    const query = validateDirectUploadQuery(req.query);

    if (!req.file) {
      const error = new Error("Resume file is required");
      error.code = "RESUME_FILE_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    const result = await resumeService.processResume({
      file: req.file,
      source: "DIRECT_UPLOAD",
      jobId: query.jobId || null,
      storageService: req.app?.locals?.resumeStorage,
      uploadedByUserId: user.id,
    });

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getResumeProcessing(req, res, next) {
  try {
    const id = req.params.id;

    if (!id) {
      const error = new Error("Resume processing id is required");
      error.code = "RESUME_PROCESSING_ID_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    const result = await resumeService.getResumeProcessingById(id, {
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

const {
  parseSendGridInbound,
  parseMailgunInbound,
  parseSesInbound,
  verifySnsNotificationSignature,
} = require("./email.extractor.service");

const {
  processInboundEmail,
} = require("./resume.inbound.service");

async function inboundSendGrid(req, res, next) {
  try {
    const payload = parseSendGridInbound(req);

    const result = await processInboundEmail({
      providerPayload: payload,
      providerMessageId: payload.providerMessageId,
      recipientEmail: payload.recipientEmail,
      senderEmail: payload.senderEmail,
      subject: payload.subject,
      subjectCode: payload.subjectCode,
      attachments: payload.attachments,
      storageService: req.app?.locals?.resumeStorage,
    });

    return res.status(result.duplicate ? 200 : 202).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function inboundMailgun(req, res, next) {
  try {
    const payload = parseMailgunInbound(req, {
      signingKey: process.env.MAILGUN_WEBHOOK_SIGNING_KEY,
    });

    const result = await processInboundEmail({
      providerPayload: payload,
      providerMessageId: payload.providerMessageId,
      recipientEmail: payload.recipientEmail,
      senderEmail: payload.senderEmail,
      subject: payload.subject,
      subjectCode: payload.subjectCode,
      attachments: payload.attachments,
      storageService: req.app?.locals?.resumeStorage,
    });

    return res.status(result.duplicate ? 200 : 202).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function inboundSes(req, res, next) {
  try {
    const notification = req.body;

    let parsedNotification = notification;
    if (typeof notification?.Message === "string") {
      try {
        parsedNotification = JSON.parse(notification.Message);
      } catch {
        parsedNotification = notification;
      }
    }

    const attachments = req.files || (req.file ? [req.file] : []);

    const parsed = parseSesInbound({
      notification: parsedNotification,
      attachments,
    });

    const result = await processInboundEmail({
      providerPayload: parsed,
      providerMessageId: parsed.providerMessageId,
      recipientEmail: parsed.recipientEmail,
      senderEmail: parsed.senderEmail,
      subject: parsed.subject,
      subjectCode: parsed.subjectCode,
      attachments: parsed.attachments,
      storageService: req.app?.locals?.resumeStorage,
    });

    return res.status(result.duplicate ? 200 : 202).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}


function createResumeController(options = {}) {
  const activeService = options.service || resumeService;
  return {
    uploadResume: (req, res, next) => uploadResume(req, res, next),
    getResumeProcessing: (req, res, next) => getResumeProcessing(req, res, next),
    parseUpload: (req, res, next) => uploadResume(req, res, next),
    inboundSendGrid: (req, res, next) => inboundSendGrid(req, res, next),
    inboundMailgun: (req, res, next) => inboundMailgun(req, res, next),
    inboundSes: (req, res, next) => inboundSes(req, res, next),
  };
}

module.exports = {
  uploadResume,
  getResumeProcessing,
  parseUpload: uploadResume,
  inboundSendGrid,
  inboundMailgun,
  inboundSes,
  createResumeController,
};


