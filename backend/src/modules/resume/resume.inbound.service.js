"use strict";

const resumeRepository = require("./resume.repository");

const {
  RESUME_ERROR_CODES,
  INBOUND_EMAIL_PROVIDERS
} = require("./resume.constants");

const {
  buildInboundEmailIdentity
} = require("./email.extractor.service");

function createError(code, message, statusCode = 400) {
  const error = new Error(message);

  error.code = code;
  error.statusCode = statusCode;

  return error;
}

function sanitizeErrorMessage(error) {
  if (!error) {
    return "Inbound email processing failed.";
  }

  if (
    error.code === RESUME_ERROR_CODES.RESUME_PARSE_FAILED ||
    error.code === RESUME_ERROR_CODES.RESUME_STORAGE_FAILED
  ) {
    return "Resume processing failed.";
  }

  return error.message || "Inbound email processing failed.";
}

function getResumeService() {
  const resumeService = require("./resume.service");

  return resumeService;
}

function assertProvider(provider) {
  if (
    !Object.values(INBOUND_EMAIL_PROVIDERS).includes(
      provider
    )
  ) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_INVALID_PROVIDER,
      "Unsupported inbound email provider."
    );
  }
}

async function reserveInboundEvent({
  provider,
  providerMessageId,
  recipientEmail,
  senderEmail,
  subject
}) {
  assertProvider(provider);

  if (!providerMessageId) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_MESSAGE_ID_REQUIRED,
      "Provider message ID is required."
    );
  }

  const event =
    await resumeRepository.createInboundEmailEventSafely({
      provider,
      providerMessageId,
      recipientEmail: recipientEmail || null,
      senderEmail: senderEmail || null,
      subject: subject || null,
      status: "PROCESSING"
    });

  if (event) {
    return {
      type: "NEW",
      event
    };
  }

  const existing =
    await resumeRepository.findInboundEmailEvent(
      provider,
      providerMessageId
    );

  if (!existing) {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_EVENT_PROCESSING,
      "Unable to reserve inbound email event.",
      503
    );
  }

  if (existing.status === "COMPLETED") {
    return {
      type: "COMPLETED",
      event: existing
    };
  }

  if (existing.status === "PROCESSING") {
    return {
      type: "PROCESSING",
      event: existing
    };
  }

  /*
   * FAILED events are intentionally not automatically reused.
   *
   * This prevents duplicate processing of a permanently invalid
   * email while allowing a controlled retry endpoint/job later.
   */
  return {
    type: "FAILED",
    event: existing
  };
}

async function processInboundEmail({
  providerPayload,
  storageService,
  providerMessageId,
  recipientEmail,
  senderEmail,
  subject,
  subjectCode,
  attachments
}) {
  if (!storageService) {
    throw new Error(
      "resumeStorage service is required."
    );
  }

  const normalized =
    buildInboundEmailIdentity({
      provider: providerPayload.provider,
      providerMessageId,
      recipientEmail,
      senderEmail,
      subject,
      subjectCode,
      attachments
    });

  const reservation =
    await reserveInboundEvent({
      provider: normalized.provider,
      providerMessageId:
        normalized.providerMessageId,
      recipientEmail:
        normalized.recipientEmail,
      senderEmail:
        normalized.senderEmail,
      subject: normalized.subject
    });

  if (reservation.type === "COMPLETED") {
    return {
      duplicate: true,
      processingId:
        reservation.event.resumeProcessingId
    };
  }

  if (reservation.type === "PROCESSING") {
    return {
      duplicate: true,
      processing: true,
      processingId:
        reservation.event.resumeProcessingId || null
    };
  }

  if (reservation.type === "FAILED") {
    throw createError(
      RESUME_ERROR_CODES.INBOUND_EVENT_FAILED,
      "This inbound email has already failed processing.",
      409
    );
  }

  const eventId = reservation.event.id;

  try {
    const results = [];

    const resumeService = getResumeService();

    /*
     * Each supported resume attachment is processed independently.
     * The inbound event itself remains idempotent.
     */
    for (const attachment of normalized.attachments) {
      const result =
        await resumeService.processResume({
          file: {
            buffer: attachment.buffer,
            originalname: attachment.filename,
            mimetype: attachment.contentType,
            size: attachment.size
          },

          source: "INBOUND_EMAIL",

          inboundEmail:
            normalized.recipientEmail,

          subjectCode:
            normalized.subjectCode,

          storageService,

          uploadedByUserId: null
        });

      results.push(result);
    }

    /*
     * One event can contain multiple attachments.
     * Store the first successful processing ID as the event anchor.
     */
    const firstSuccessful =
      results.find(
        (item) => item?.resumeProcessing?.id || item?.processing?.id
      );

    await resumeRepository.markInboundEmailEventCompleted(
      eventId,
      firstSuccessful?.resumeProcessing?.id || firstSuccessful?.processing?.id || null
    );

    return {
      duplicate: false,
      results
    };
  } catch (error) {
    const errorCode =
      error.code ||
      RESUME_ERROR_CODES.INBOUND_EVENT_FAILED;

    const errorMessage =
      sanitizeErrorMessage(error);

    await resumeRepository.markInboundEmailEventFailed(
      eventId,
      errorCode,
      errorMessage
    );

    throw error;
  }
}

module.exports = {
  reserveInboundEvent,
  processInboundEmail
};
