"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const publicContactService = require("./public-contact.service");
const validator = require("./public-contact.validator");

class PublicContactController {
  submitInquiry = asyncHandler(async (req, res) => {
    const data = validator.createPublicContactSchema.parse(req.body);
    const inquiry = await publicContactService.submitInquiry(data);
    
    return SuccessResponse.send(
      res,
      {
        message: "Inquiry submitted successfully",
        data: { inquiry }
      },
      StatusCodes.CREATED
    );
  });

  listAllInquiries = asyncHandler(async (req, res) => {
    const query = validator.getPublicContactsAdminQuerySchema.parse(req.query);
    const result = await publicContactService.getAllInquiries(query);
    
    return SuccessResponse.send(
      res,
      {
        message: "Inquiries fetched successfully",
        data: result
      },
      StatusCodes.OK
    );
  });

  getInquiryAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const inquiry = await publicContactService.getInquiryAdmin(id);
    
    return SuccessResponse.send(
      res,
      {
        message: "Inquiry fetched successfully",
        data: { inquiry }
      },
      StatusCodes.OK
    );
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = validator.updatePublicContactStatusSchema.parse(req.body);
    const updated = await publicContactService.updateStatus(id, status);
    
    return SuccessResponse.send(
      res,
      {
        message: "Status updated successfully",
        data: { inquiry: updated }
      },
      StatusCodes.OK
    );
  });

  replyToInquiry = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reply } = validator.replyPublicContactSchema.parse(req.body);
    const adminId = req.user.id; // from requireAuth middleware

    const { inquiry, emailSent } = await publicContactService.replyToInquiry(id, reply, adminId);
    
    return SuccessResponse.send(
      res,
      {
        message: emailSent ? "Reply saved successfully" : "Reply saved but email delivery failed",
        data: { inquiry, emailSent }
      },
      StatusCodes.OK
    );
  });
}

module.exports = new PublicContactController();
