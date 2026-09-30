"use strict";

const supportRepository = require("./support.repository");
const { SUPPORT_CONSTANTS } = require("./support.constants");
const { BadRequestError, NotFoundError, ForbiddenError } = require("../../common/errors");

/**
 * Submit a new support request from an authenticated HR user.
 * The userId and companyId come from the backend auth context — never from client input.
 */
const submitRequest = async ({ userId, companyId, subject, message }) => {
  // Check for duplicate submission within 60s window
  const duplicate = await supportRepository.findRecentDuplicate(userId, subject);
  if (duplicate) {
    throw new BadRequestError(
      "A support request with the same subject was submitted recently. Please wait before submitting again.",
      SUPPORT_CONSTANTS.ERROR_CODES.DUPLICATE_SUBMISSION
    );
  }

  const request = await supportRepository.createSupportRequest({
    userId,
    companyId: companyId || null,
    subject,
    message,
    status: SUPPORT_CONSTANTS.STATUS.OPEN,
  });

  // Attempt email notification to Super Admin — failure does not affect the saved request
  try {
    const { sendEmail } = require("../../utils/email");
    const env = require("../../config/env");

    await sendEmail({
      to: env.smtp.fromEmail,
      subject: `[HireQuest Support] New Request: ${subject}`,
      text: `A new support request has been submitted.\n\nSubject: ${subject}\nMessage: ${message}\n\nSubmitted by User ID: ${userId}\nCompany ID: ${companyId || "N/A"}\n\nPlease log in to the Super Admin console to manage this request.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">New Support Request</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold; color: #475569;">Subject:</td><td style="padding: 8px;">${subject}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #475569;">Message:</td><td style="padding: 8px;">${message}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #475569;">User ID:</td><td style="padding: 8px;">${userId}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #475569;">Company ID:</td><td style="padding: 8px;">${companyId || "N/A"}</td></tr>
          </table>
          <p style="color: #64748b; margin-top: 16px;">Log in to the <a href="${env.frontend.url}/admin/support">Super Admin Console</a> to manage this request.</p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Failed to send support request notification email:", emailError?.message || emailError);
    // The request is already saved — do not throw
  }

  return request;
};

/**
 * List support requests for a specific HR user.
 */
const listMyRequests = async ({ userId, page, limit, status, sortBy, sortOrder }) => {
  return supportRepository.findByUserId({ userId, page, limit, status, sortBy, sortOrder });
};

/**
 * List all support requests (Super Admin only — authorization checked in controller).
 */
const listAllRequests = async ({ page, limit, status, sortBy, sortOrder }) => {
  return supportRepository.findAll({ page, limit, status, sortBy, sortOrder });
};

/**
 * Get a single support request by ID.
 * Verifies ownership for HR users; Super Admin can access any.
 */
const getRequest = async (requestId, userId, isSuperAdmin) => {
  const request = await supportRepository.findById(requestId);
  if (!request) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  if (!isSuperAdmin && request.userId !== userId) {
    throw new ForbiddenError(
      "You do not have permission to view this support request.",
      SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
    );
  }

  return request;
};

/**
 * Update the status of a support request (Super Admin only).
 */
const updateRequestStatus = async (requestId, status) => {
  const existing = await supportRepository.findById(requestId);
  if (!existing) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  return supportRepository.updateStatus(requestId, status);
};

/**
 * Reply to a support request (Super Admin only).
 * Saves the reply, updates the status, and sends an email to the HR user.
 */
const replyToRequest = async (requestId, { reply, repliedById }) => {
  const existing = await supportRepository.findById(requestId);
  if (!existing) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  const updated = await supportRepository.saveReply(requestId, {
    adminReply: reply,
    repliedById,
    status: SUPPORT_CONSTANTS.STATUS.RESOLVED,
  });

  // Send reply email to the HR user — failure does not roll back the saved reply
  let emailSent = false;
  try {
    const { sendEmail } = require("../../utils/email");

    await sendEmail({
      to: updated.user.email,
      subject: `[HireQuest Support] Reply: ${updated.subject}`,
      text: `Your support request has been responded to.\n\nSubject: ${updated.subject}\nYour Message: ${updated.message}\n\nAdmin Reply:\n${reply}\n\nThank you for contacting HireQuest support.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Support Request Reply</h2>
          <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 12px 0;">
            <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Your Subject:</p>
            <p style="margin: 0 0 12px;">${updated.subject}</p>
            <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Your Message:</p>
            <p style="margin: 0;">${updated.message}</p>
          </div>
          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 16px; margin: 12px 0;">
            <p style="font-weight: bold; color: #1e40af; margin: 0 0 8px;">Admin Reply:</p>
            <p style="margin: 0; color: #1e3a5f;">${reply}</p>
          </div>
          <p style="color: #64748b; font-size: 13px; margin-top: 20px;">Thank you for contacting HireQuest support.</p>
        </div>
      `,
    });
    emailSent = true;
  } catch (emailError) {
    console.error("Failed to send support reply email:", emailError?.message || emailError);
  }

  return { ...updated, emailSent };
};

module.exports = {
  submitRequest,
  listMyRequests,
  listAllRequests,
  getRequest,
  updateRequestStatus,
  replyToRequest,
};
