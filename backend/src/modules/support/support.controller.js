"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const supportService = require("./support.service");
const {
  createSupportRequestSchema,
  listSupportRequestsSchema,
  supportRequestIdParamSchema,
  updateSupportStatusSchema,
  replySupportRequestSchema,
} = require("./support.validator");

class SupportController {
  /**
   * HR: Submit a new support request.
   * POST /api/v1/support
   */
  submitRequest = asyncHandler(async (req, res) => {
    const validated = createSupportRequestSchema.parse(req.body);

    // Obtain identity from authenticated backend context — never from client
    const userId = req.user.id;

    // Resolve companyId from the X-Company-Id header or first membership
    let companyId = req.headers["x-company-id"] || null;
    if (!companyId && req.user.companyMembers && req.user.companyMembers.length > 0) {
      companyId = req.user.companyMembers[0].companyId;
    }

    const result = await supportService.submitRequest({
      userId,
      companyId,
      subject: validated.subject,
      message: validated.message,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Support request submitted successfully.",
        data: { request: result },
      },
      StatusCodes.CREATED
    );
  });

  /**
   * HR: List my own support requests.
   * GET /api/v1/support/my-requests
   */
  listMyRequests = asyncHandler(async (req, res) => {
    const query = listSupportRequestsSchema.parse(req.query);

    const result = await supportService.listMyRequests({
      userId: req.user.id,
      ...query,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Support requests retrieved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * HR: Get a single support request (own only).
   * GET /api/v1/support/:requestId
   */
  getRequest = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";

    const request = await supportService.getRequest(requestId, req.user.id, isSuperAdmin);

    return SuccessResponse.send(
      res,
      {
        message: "Support request retrieved successfully.",
        data: { request },
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin: List all support requests.
   * GET /api/v1/super-admin/support
   */
  listAllRequests = asyncHandler(async (req, res) => {
    const query = listSupportRequestsSchema.parse(req.query);

    const result = await supportService.listAllRequests(query);

    return SuccessResponse.send(
      res,
      {
        message: "All support requests retrieved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin: Get a single support request.
   * GET /api/v1/super-admin/support/:requestId
   */
  getRequestAdmin = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);

    const request = await supportService.getRequest(requestId, req.user.id, true);

    return SuccessResponse.send(
      res,
      {
        message: "Support request retrieved successfully.",
        data: { request },
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin: Update a support request's status.
   * PATCH /api/v1/super-admin/support/:requestId/status
   */
  updateStatus = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);
    const { status } = updateSupportStatusSchema.parse(req.body);

    const request = await supportService.updateRequestStatus(requestId, status);

    return SuccessResponse.send(
      res,
      {
        message: `Support request status updated to ${status}.`,
        data: { request },
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin: Reply to a support request.
   * POST /api/v1/super-admin/support/:requestId/reply
   */
  replyToRequest = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);
    const { reply } = replySupportRequestSchema.parse(req.body);

    const result = await supportService.replyToRequest(requestId, {
      reply,
      repliedById: req.user.id,
    });

    return SuccessResponse.send(
      res,
      {
        message: result.emailSent
          ? "Reply sent successfully and email delivered."
          : "Reply saved successfully but email delivery failed.",
        data: {
          request: result,
          emailSent: result.emailSent,
        },
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SupportController();
