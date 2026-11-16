"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const planService = require("../plan/plan.service");

class SuperAdminPlansController {
  /**
   * List all plans with subscriber statistics
   * GET /api/v1/super-admin/plans
   */
  listPlans = asyncHandler(async (req, res) => {
    const plans = await planService.getAllPlansWithStats();

    return SuccessResponse.send(
      res,
      {
        message: "Plans catalog retrieved successfully",
        data: { plans },
      },
      StatusCodes.OK
    );
  });

  /**
   * Create a new plan catalog entry
   * POST /api/v1/super-admin/plans
   */
  createPlan = asyncHandler(async (req, res) => {
    const plan = await planService.createPlan(req.body);

    return SuccessResponse.send(
      res,
      {
        message: "Plan created successfully",
        data: { plan },
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Update an existing plan catalog entry
   * PATCH /api/v1/super-admin/plans/:id
   */
  updatePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const plan = await planService.updatePlan(id, req.body);

    return SuccessResponse.send(
      res,
      {
        message: "Plan updated successfully. Changes will apply to new subscribers and upcoming renewals.",
        data: { plan },
      },
      StatusCodes.OK
    );
  });

  /**
   * Toggle Plan active/inactive status
   * PATCH /api/v1/super-admin/plans/:id/status
   */
  toggleStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;

    const plan = await planService.togglePlanStatus(id, isActive);

    return SuccessResponse.send(
      res,
      {
        message: `Plan ${isActive ? "activated" : "deactivated"} successfully`,
        data: { plan },
      },
      StatusCodes.OK
    );
  });

  /**
   * Delete Plan (only allowed if zero subscriptions/payments reference it)
   * DELETE /api/v1/super-admin/plans/:id
   */
  deletePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await planService.deletePlan(id);

    return SuccessResponse.send(
      res,
      {
        message: "Plan deleted successfully",
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SuperAdminPlansController();

