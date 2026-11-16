"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const planService = require("./plan.service");

class PlanController {
  /**
   * List all active plans for public/company dashboard pricing
   * GET /api/v1/plans
   */
  listActivePlans = asyncHandler(async (req, res) => {
    const plans = await planService.getActivePlans();

    return SuccessResponse.send(
      res,
      {
        message: "Active subscription plans retrieved successfully",
        data: { plans },
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Current Company Subscription & Quota Usage
   * GET /api/v1/subscriptions/current
   */
  getCurrentSubscription = asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const details = await planService.getCompanyUsage(companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Current subscription and usage details retrieved successfully",
        data: details,
      },
      StatusCodes.OK
    );
  });

  /**
   * Start 7-Day Free Demo Trial
   * POST /api/v1/subscriptions/demo/start
   */
  startDemo = asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const actorRole = req.companyMember?.role;

    const subscription = await planService.startDemoTrial(companyId, actorRole);

    return SuccessResponse.send(
      res,
      {
        message: "7-day Demo trial started successfully! Your workspace is active.",
        data: { subscription },
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Public Onboarding: Register new company and owner with 7-Day Demo Trial
   * POST /api/v1/plans/register-demo
   */
  registerDemo = asyncHandler(async (req, res) => {
    const result = await planService.registerDemoCompany(req.body);

    return SuccessResponse.send(
      res,
      {
        message: result.message,
        data: result,
      },
      StatusCodes.CREATED
    );
  });
}

module.exports = new PlanController();

