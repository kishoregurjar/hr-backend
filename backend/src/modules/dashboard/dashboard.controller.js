"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const dashboardService = require("./dashboard.service");

class DashboardController {
  getOverview = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const companyId = req.company?.id;

    const data = await dashboardService.getDashboardOverview({ userId, companyId });

    return SuccessResponse.send(
      res,
      {
        message: "Dashboard overview fetched successfully",
        data,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new DashboardController();
