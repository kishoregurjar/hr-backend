"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const trialApplicationService = require("../trial-application/trial-application.service");

class SuperAdminTrialRequestsController {
  /**
   * List Trial Requests
   * GET /api/v1/super-admin/trial-requests
   */
  listRequests = asyncHandler(async (req, res) => {
    const { page, limit, status, search } = req.query;

    const data = await trialApplicationService.listTrialRequests({
      page,
      limit,
      status,
      search,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Trial requests retrieved successfully",
        data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Single Trial Request Details
   * GET /api/v1/super-admin/trial-requests/:id
   */
  getRequestDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const application = await trialApplicationService.getTrialRequestById(id);

    return SuccessResponse.send(
      res,
      {
        message: "Trial request details retrieved successfully",
        data: { application },
      },
      StatusCodes.OK
    );
  });

  /**
   * Approve Trial Application & Provision Workspace
   * POST /api/v1/super-admin/trial-requests/:id/approve
   */
  approveRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { internalNotes } = req.body || {};

    const result = await trialApplicationService.approveApplication(
      id,
      req.user,
      internalNotes
    );

    return SuccessResponse.send(res, result, StatusCodes.OK);
  });

  /**
   * Reject Trial Application
   * POST /api/v1/super-admin/trial-requests/:id/reject
   */
  rejectRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rejectionReason, reviewNotes } = req.body || {};

    const result = await trialApplicationService.rejectApplication(
      id,
      req.user,
      { rejectionReason, reviewNotes }
    );

    return SuccessResponse.send(res, result, StatusCodes.OK);
  });

  /**
   * Resend Approval Email to Verified Owner
   * POST /api/v1/super-admin/trial-requests/:id/resend-approval-email
   */
  resendApprovalEmail = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await trialApplicationService.resendApprovalEmail(
      id,
      req.user
    );

    return SuccessResponse.send(res, result, StatusCodes.OK);
  });
}

module.exports = new SuperAdminTrialRequestsController();

