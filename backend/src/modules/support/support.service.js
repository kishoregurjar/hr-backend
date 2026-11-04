"use strict";

const supportRepository = require("./support.repository");
const { SUPPORT_CONSTANTS } = require("./support.constants");
const { BadRequestError, NotFoundError, ForbiddenError } = require("../../common/errors");
const { prisma } = require("../../config/prisma");

/**
 * Submit a new support request from an authenticated user.
 * Resolves company from trusted server-side authentication and membership data.
 * Does not trust unvalidated company IDs passed from the client.
 */
const submitRequest = async ({ userId, requestedCompanyId, subject, message }) => {
  // Check for duplicate submission within 60s window
  const duplicate = await supportRepository.findRecentDuplicate(userId, subject);
  if (duplicate) {
    throw new BadRequestError(
      "A support request with the same subject was submitted recently. Please wait before submitting again.",
      SUPPORT_CONSTANTS.ERROR_CODES.DUPLICATE_SUBMISSION
    );
  }

  // Fetch submitter identity from database
  const submitterUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });

  // Resolve company from trusted server-side membership
  let resolvedCompanyId = null;
  let resolvedMemberRole = null;
  let companyName = null;

  if (requestedCompanyId) {
    // If client specified a company ID, verify that the user is actually a member of this company
    const member = await supportRepository.findCompanyMember(requestedCompanyId, userId);
    if (!member) {
      throw new ForbiddenError(
        "You do not have permission to submit support requests for this company.",
        SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
      );
    }
    resolvedCompanyId = member.companyId;
    resolvedMemberRole = member.role;
    companyName = member.company?.name || null;
  } else {
    // Otherwise fallback to user's verified primary/default company membership
    const defaultMember = await supportRepository.findDefaultCompanyMemberForUser(userId);
    if (defaultMember) {
      resolvedCompanyId = defaultMember.companyId;
      resolvedMemberRole = defaultMember.role;
      companyName = defaultMember.company?.name || null;
    }
  }

  // Determine whether submitter is Company Owner or Platform User
  const isOwnerSubmitter =
    resolvedMemberRole === "OWNER" ||
    resolvedMemberRole === "COMPANY_OWNER" ||
    submitterUser?.role === "SUPER_ADMIN" ||
    !resolvedCompanyId;

  // Persist the ticket with its verified company/tenant association
  const request = await supportRepository.createSupportRequest({
    userId,
    companyId: resolvedCompanyId || null,
    subject,
    message,
    status: SUPPORT_CONSTANTS.STATUS.OPEN,
  });

  // Route email notification:
  // - Owner tickets route directly to Platform Super Admin!
  // - HR / Recruiter tickets route to their Company Owner / Admin!
  try {
    const { sendEmail } = require("../../utils/email");
    const env = require("../../config/env");

    let recipientEmails = [];

    if (isOwnerSubmitter) {
      // Owner ticket -> Super Admin
      recipientEmails = [env.smtp?.fromEmail || "admin@hirequest.com"];
    } else if (resolvedCompanyId) {
      // HR ticket -> Company Owner
      const activeAdmins = await supportRepository.findCompanyActiveAdmins(resolvedCompanyId);
      recipientEmails = activeAdmins
        .map((m) => m.user?.email)
        .filter((email) => email && email !== submitterUser?.email);
    }

    if (recipientEmails.length > 0) {
      const appUrl = env.frontend?.url || "http://localhost:3000";
      const orgName = companyName || "HireQuest";
      const submitterDisplay = submitterUser?.name
        ? `${submitterUser.name} (${submitterUser.email})`
        : submitterUser?.email || "Team Member";

      if (isOwnerSubmitter) {
        await sendEmail({
          to: recipientEmails.join(", "),
          subject: `[HireQuest Platform Support] New Request from ${orgName}: ${subject}`,
          text: `A new company owner support request has been submitted.\n\nSubject: ${subject}\nMessage: ${message}\n\nSubmitted by: ${submitterDisplay}\nCompany: ${orgName}\nRole: Company Owner\n\nPlease log in to the Super Admin Dashboard to review and manage this request.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <h2 style="color: #2563eb; margin-bottom: 8px;">New Company Owner Support Request</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 0;">
                The owner of <strong>${orgName}</strong> has submitted a platform support ticket.
              </p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569; width: 120px;">Submitted By:</td><td>${submitterDisplay}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569;">Company:</td><td>${orgName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569;">Role:</td><td>Company Owner</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569;">Subject:</td><td style="font-weight: 600;">${subject}</td></tr>
                </table>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                  <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Message Details:</p>
                  <p style="margin: 0; white-space: pre-wrap; color: #334155;">${message}</p>
                </div>
              </div>
              <p style="color: #64748b; font-size: 13px; margin-top: 16px;">
                Please log in to the <a href="${appUrl}/admin/support" style="color: #2563eb; text-decoration: underline;">Super Admin Dashboard</a> to respond to this ticket.
              </p>
            </div>
          `,
        });
      } else {
        await sendEmail({
          to: recipientEmails.join(", "),
          subject: `[${orgName} Support] New Request: ${subject}`,
          text: `A new support request has been submitted.\n\nSubject: ${subject}\nMessage: ${message}\n\nSubmitted by: ${submitterDisplay}\nCompany: ${orgName}\nRole: ${resolvedMemberRole || "Team Member"}\n\nPlease log in to your company dashboard to review and manage this request.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <h2 style="color: #2563eb; margin-bottom: 8px;">New Support Request</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 0;">
                A team member in <strong>${orgName}</strong> has submitted an internal support ticket.
              </p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569; width: 120px;">Submitted By:</td><td>${submitterDisplay}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569;">Role:</td><td>${resolvedMemberRole || "Team Member"}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #475569;">Subject:</td><td style="font-weight: 600;">${subject}</td></tr>
                </table>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                  <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Message Details:</p>
                  <p style="margin: 0; white-space: pre-wrap; color: #334155;">${message}</p>
                </div>
              </div>
              <p style="color: #64748b; font-size: 13px; margin-top: 16px;">
                Please log in to your <a href="${appUrl}/support-tickets" style="color: #2563eb; text-decoration: underline;">Company Dashboard</a> to respond to this ticket.
              </p>
            </div>
          `,
        });
      }
    }
  } catch (emailError) {
    console.error("Failed to send support request notification email:", emailError?.message || emailError);
    // Failure to deliver email does not rollback the ticket
  }

  return request;
};

/**
 * List support requests for a specific HR user (Submitter view).
 */
const listMyRequests = async ({ userId, page, limit, status, sortBy, sortOrder }) => {
  return supportRepository.findByUserId({ userId, page, limit, status, sortBy, sortOrder });
};

/**
 * List support requests for a company (Company Owner / Admin view).
 * Strictly requires the caller to be an active OWNER or ADMIN of the requested company.
 * Platform Super Admin who is not a member of the company cannot access tenant tickets.
 */
const listCompanyRequests = async ({ user, requestedCompanyId, page, limit, status, sortBy, sortOrder }) => {
  let targetCompanyId = requestedCompanyId;

  // Resolve user's active company membership
  if (targetCompanyId) {
    const membership = await supportRepository.findCompanyMember(targetCompanyId, user.id);
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      throw new ForbiddenError(
        "Only company owners and administrators can view company support requests.",
        SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
      );
    }
  } else {
    const defaultMember = await supportRepository.findDefaultCompanyMemberForUser(user.id);
    if (!defaultMember || (defaultMember.role !== "OWNER" && defaultMember.role !== "ADMIN")) {
      throw new ForbiddenError(
        "Only company owners and administrators can view company support requests.",
        SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
      );
    }
    targetCompanyId = defaultMember.companyId;
  }

  if (!targetCompanyId) {
    throw new ForbiddenError(
      "No valid company membership found.",
      SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
    );
  }

  return supportRepository.findByCompanyId({
    companyId: targetCompanyId,
    page,
    limit,
    status,
    sortBy,
    sortOrder,
  });
};

/**
 * List platform-level support requests (Super Admin only).
 * Excludes ordinary tenant tickets.
 */
const listAllRequests = async ({ page, limit, status, sortBy, sortOrder }) => {
  return supportRepository.findAll({ page, limit, status, sortBy, sortOrder });
};

/**
 * Check if a ticket was submitted by a company Owner or platform user (destined for Super Admin).
 */
const isOwnerOrPlatformTicket = async (request) => {
  if (!request.companyId || request.user?.role === "SUPER_ADMIN") {
    return true;
  }
  if (request.user?.companyMembers && Array.isArray(request.user.companyMembers)) {
    const member = request.user.companyMembers.find((m) => m.companyId === request.companyId);
    if (member && (member.role === "OWNER" || member.role === "COMPANY_OWNER")) {
      return true;
    }
  }
  const member = await supportRepository.findCompanyMember(request.companyId, request.userId);
  if (member && (member.role === "OWNER" || member.role === "COMPANY_OWNER")) {
    return true;
  }
  return false;
};
/**
 * Get a single support request by ID.
 * Accessible by:
 * 1. The ticket submitter (request.userId === user.id)
 * 2. Platform Super Admin (if platform ticket or Company Owner ticket)
 * 3. Active Owner/Admin of that company
 */
const getRequest = async (requestId, user) => {
  const request = await supportRepository.findById(requestId);
  if (!request) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  // 1. Submitter can always view their own ticket
  if (request.userId === user.id) {
    return request;
  }

  const isOwnerTicket = await isOwnerOrPlatformTicket(request);

  // 2. Owner-to-Platform ticket (submitted by Company Owner or platform user):
  // Accessible by Platform Super Admin or Company Owner/Admin of that company.
  if (isOwnerTicket) {
    if (user.role === "SUPER_ADMIN") {
      return request;
    }
    if (request.companyId) {
      const member = await supportRepository.findCompanyMember(request.companyId, user.id);
      if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
        return request;
      }
    }
    throw new ForbiddenError(
      "You do not have permission to view this support request.",
      SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
    );
  }

  // 3. Internal HR ticket (submitted by recruiter/HR for company owner):
  // Strictly private between submitter and active Owner/Admin of that company.
  // Platform Super Admin must NOT view internal tenant tickets.
  if (request.companyId) {
    const member = await supportRepository.findCompanyMember(request.companyId, user.id);
    if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
      return request;
    }
  }

  throw new ForbiddenError(
    "You do not have permission to view this support request.",
    SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
  );
};

/**
 * Update the status of a support request.
 * Accessible by:
 * 1. Active Owner/Admin of that company
 * 2. Platform Super Admin (if platform ticket or Company Owner ticket)
 */
const updateRequestStatus = async (requestId, status, user) => {
  const existing = await supportRepository.findById(requestId);
  if (!existing) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  const isOwnerTicket = await isOwnerOrPlatformTicket(existing);
  let isAuthorized = false;

  if (isOwnerTicket) {
    // Owner ticket to platform: Super Admin is authorized!
    if (user.role === "SUPER_ADMIN") {
      isAuthorized = true;
    } else if (existing.companyId) {
      const member = await supportRepository.findCompanyMember(existing.companyId, user.id);
      if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
        isAuthorized = true;
      }
    }
  } else {
    // Internal HR ticket to company: ONLY active Owner/Admin of that company is authorized!
    if (existing.companyId) {
      const member = await supportRepository.findCompanyMember(existing.companyId, user.id);
      if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    throw new ForbiddenError(
      "You do not have permission to update this support request.",
      SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
    );
  }

  return supportRepository.updateStatus(requestId, status);
};

/**
 * Reply to a support request.
 * Accessible by:
 * 1. Active Owner/Admin of that company
 * 2. Platform Super Admin (if platform ticket or Company Owner ticket)
 */
const replyToRequest = async (requestId, { reply, user }) => {
  const existing = await supportRepository.findById(requestId);
  if (!existing) {
    throw new NotFoundError(
      "Support request not found.",
      SUPPORT_CONSTANTS.ERROR_CODES.REQUEST_NOT_FOUND
    );
  }

  const isOwnerTicket = await isOwnerOrPlatformTicket(existing);
  let isAuthorized = false;

  if (isOwnerTicket) {
    // Owner ticket to platform: Super Admin is authorized to reply!
    if (user.role === "SUPER_ADMIN") {
      isAuthorized = true;
    } else if (existing.companyId) {
      const member = await supportRepository.findCompanyMember(existing.companyId, user.id);
      if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
        isAuthorized = true;
      }
    }
  } else {
    // Internal HR ticket: ONLY active Owner/Admin of that company can reply.
    if (existing.companyId) {
      const member = await supportRepository.findCompanyMember(existing.companyId, user.id);
      if (member && (member.role === "OWNER" || member.role === "ADMIN")) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    throw new ForbiddenError(
      "You do not have permission to reply to this support request.",
      SUPPORT_CONSTANTS.ERROR_CODES.ACCESS_DENIED
    );
  }

  const updated = await supportRepository.saveReply(requestId, {
    adminReply: reply,
    repliedById: user.id,
    status: SUPPORT_CONSTANTS.STATUS.RESOLVED,
  });

  // Send reply email to the ticket submitter
  let emailSent = false;
  try {
    const { sendEmail } = require("../../utils/email");
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const responderName = user.name || (isSuperAdmin ? "HireQuest Platform Support" : (updated.company?.name ? `${updated.company.name} Administrator` : "Company Administrator"));
    const companyTitle = isSuperAdmin ? "HireQuest Platform" : (updated.company?.name || "HireQuest");

    await sendEmail({
      to: updated.user.email,
      subject: `[${companyTitle} Support] Reply: ${updated.subject}`,
      text: `Your support request has been responded to by ${responderName}.\n\nSubject: ${updated.subject}\nYour Message: ${updated.message}\n\nResponse:\n${reply}\n\nThank you for contacting support.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #2563eb;">Support Request Reply</h2>
          <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 12px 0; border: 1px solid #e2e8f0;">
            <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Your Subject:</p>
            <p style="margin: 0 0 12px; font-weight: 600;">${updated.subject}</p>
            <p style="font-weight: bold; color: #475569; margin: 0 0 4px;">Your Message:</p>
            <p style="margin: 0; white-space: pre-wrap; color: #334155;">${updated.message}</p>
          </div>
          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 16px; margin: 12px 0;">
            <p style="font-weight: bold; color: #1e40af; margin: 0 0 8px;">Response from ${responderName}:</p>
            <p style="margin: 0; color: #1e3a5f; white-space: pre-wrap;">${reply}</p>
          </div>
          <p style="color: #64748b; font-size: 13px; margin-top: 20px;">
            Thank you for contacting ${companyTitle} support.
          </p>
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
  listCompanyRequests,
  listAllRequests,
  getRequest,
  updateRequestStatus,
  replyToRequest,
};
