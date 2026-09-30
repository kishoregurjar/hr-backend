"use strict";

const publicContactRepository = require("./public-contact.repository");
const { tooManyRequests, notFound } = require("../../utils/app-error");
const { sendEmail } = require("../../utils/email");
const { PUBLIC_CONTACT_STATUS } = require("./public-contact.constants");

class PublicContactService {
  async submitInquiry(data) {
    const { fullName, email, subject, message } = data;

    // Prevent duplicates from same email + subject within 60 seconds
    const duplicate = await publicContactRepository.findRecentDuplicate(email, subject, 60);
    if (duplicate) {
      throw tooManyRequests("You have already submitted a similar inquiry recently. Please wait before trying again.");
    }

    const inquiry = await publicContactRepository.createInquiry({
      fullName,
      email,
      subject,
      message,
      status: PUBLIC_CONTACT_STATUS.OPEN,
    });

    // Fire and forget email notification to admin team
    // (Assuming generic admin email or dynamic from config, we'll log it if fails)
    this._notifyAdmin(inquiry).catch((err) => {
      console.error(`[PublicContactService] Failed to notify admin for inquiry ${inquiry.id}:`, err.message);
    });

    return inquiry;
  }

  async _notifyAdmin(inquiry) {
    const adminEmail = process.env.SUPPORT_ADMIN_EMAIL || "admin@hirequest.com";
    await sendEmail({
      to: adminEmail,
      subject: `New Public Inquiry: ${inquiry.subject}`,
      html: `
        <h3>New Public Inquiry Submitted</h3>
        <p><strong>Name:</strong> ${inquiry.fullName}</p>
        <p><strong>Email:</strong> ${inquiry.email}</p>
        <p><strong>Subject:</strong> ${inquiry.subject}</p>
        <p><strong>Message:</strong></p>
        <p>${inquiry.message}</p>
        <p><br/>Log in to the Admin Dashboard to reply.</p>
      `,
    });
  }

  async getAllInquiries(queryOptions) {
    const { page = 1, limit = 20, status, sortField = "createdAt", sortOrder = "desc" } = queryOptions;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      publicContactRepository.findManyInquiries({ skip, take: limit, status, sortField, sortOrder }),
      publicContactRepository.countInquiries({ status }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInquiryAdmin(id) {
    const inquiry = await publicContactRepository.getInquiryById(id);
    if (!inquiry) {
      throw notFound("Public inquiry not found");
    }
    return inquiry;
  }

  async updateStatus(id, status) {
    const inquiry = await publicContactRepository.getInquiryById(id);
    if (!inquiry) {
      throw notFound("Public inquiry not found");
    }

    const updated = await publicContactRepository.updateInquiryStatus(id, status);
    return updated;
  }

  async replyToInquiry(id, reply, adminId) {
    const inquiry = await publicContactRepository.getInquiryById(id);
    if (!inquiry) {
      throw notFound("Public inquiry not found");
    }

    const updated = await publicContactRepository.addReply(id, reply, adminId);

    // Try to send email, if it fails return flag to controller
    let emailSent = true;
    try {
      await sendEmail({
        to: updated.email,
        subject: `Re: ${updated.subject}`,
        html: `
          <p>Hi ${updated.fullName},</p>
          <p>Thank you for reaching out to HireQuest.</p>
          <p>${updated.adminReply}</p>
          <br/>
          <p>Best regards,<br/>HireQuest Team</p>
          <hr/>
          <p><em>Your original message:</em></p>
          <p>${updated.message}</p>
        `,
      });
    } catch (err) {
      console.error(`[PublicContactService] Failed to send reply email to ${updated.email}:`, err.message);
      emailSent = false;
    }

    return { inquiry: updated, emailSent };
  }
}

module.exports = new PublicContactService();
