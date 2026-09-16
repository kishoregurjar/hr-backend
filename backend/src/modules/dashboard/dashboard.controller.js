"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const dashboardService = require("./dashboard.service");

const { prisma } = require("../../config/prisma");

class DashboardController {
  getOverview = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    let companyId =
      req.headers["x-company-id"] ||
      req.query?.companyId ||
      req.company?.id;

    if (!companyId && userId) {
      const member = await prisma.companyMember.findFirst({
        where: { userId },
        select: { companyId: true },
      });
      companyId = member?.companyId || null;
    }

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
