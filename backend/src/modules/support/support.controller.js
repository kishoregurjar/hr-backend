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

    // Obtain submitter identity from authenticated backend context
    const userId = req.user.id;

    // Requested company context from header, body, or active query
    const requestedCompanyId =
      req.headers["x-company-id"] ||
      validated.companyId ||
      req.query?.companyId ||
      null;

    const result = await supportService.submitRequest({
      userId,
      requestedCompanyId,
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
   * HR: List own support requests (Submitter view).
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
   * Company Owner/Admin: List support requests for their company.
   * GET /api/v1/support or GET /api/v1/support/company-requests
   */
  listCompanyRequests = asyncHandler(async (req, res) => {
    const query = listSupportRequestsSchema.parse(req.query);

    const requestedCompanyId =
      req.headers["x-company-id"] ||
      query.companyId ||
      req.query?.companyId ||
      null;

    const result = await supportService.listCompanyRequests({
      user: req.user,
      requestedCompanyId,
      ...query,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Company support requests retrieved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * HR / Company Admin / Super Admin: Get a single support request.
   * GET /api/v1/support/:requestId
   */
  getRequest = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);

    const request = await supportService.getRequest(requestId, req.user);

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
   * Company Owner/Admin / Super Admin: Update a support request's status.
   * PATCH /api/v1/support/:requestId/status
   */
  updateStatus = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);
    const { status } = updateSupportStatusSchema.parse(req.body);

    const request = await supportService.updateRequestStatus(requestId, status, req.user);

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
   * Company Owner/Admin / Super Admin: Reply to a support request.
   * POST /api/v1/support/:requestId/reply
   */
  replyToRequest = asyncHandler(async (req, res) => {
    const { requestId } = supportRequestIdParamSchema.parse(req.params);
    const { reply } = replySupportRequestSchema.parse(req.body);

    const result = await supportService.replyToRequest(requestId, {
      reply,
      user: req.user,
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

  /**
   * Super Admin: List all support requests across platform.
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

    const request = await supportService.getRequest(requestId, req.user);

    return SuccessResponse.send(
      res,
      {
        message: "Support request retrieved successfully.",
        data: { request },
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SupportController();
