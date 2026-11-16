"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const superAdminPaymentsService = require("./super-admin.payments.service");

class SuperAdminPaymentsController {
  /**
   * Super Admin Revenue Overview
   * GET /api/v1/super-admin/payments/overview
   */
  getOverview = asyncHandler(async (req, res) => {
    const { mode } = req.query;
    const overview = await superAdminPaymentsService.getRevenueOverview({ mode });

    return SuccessResponse.send(
      res,
      {
        message: "Revenue overview retrieved successfully",
        data: overview,
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin Revenue Charts
   * GET /api/v1/super-admin/payments/charts
   */
  getCharts = asyncHandler(async (req, res) => {
    const { mode } = req.query;
    const charts = await superAdminPaymentsService.getRevenueCharts({ mode });

    return SuccessResponse.send(
      res,
      {
        message: "Revenue charts retrieved successfully",
        data: charts,
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin Payment Transactions
   * GET /api/v1/super-admin/payments/transactions
   */
  getTransactions = asyncHandler(async (req, res) => {
    const { page, limit, search, status, plan, billingCycle, dateRange } = req.query;

    const data = await superAdminPaymentsService.getPaymentTransactions({
      page,
      limit,
      search,
      status,
      plan,
      billingCycle,
      dateRange,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Payment transactions retrieved successfully",
        data,
      },
      StatusCodes.OK
    );
  });

  /**
   * Super Admin Payment Transaction Detail
   * GET /api/v1/super-admin/payments/transactions/:id
   */
  getTransactionDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const detail = await superAdminPaymentsService.getTransactionDetail(id);

    return SuccessResponse.send(
      res,
      {
        message: "Transaction details retrieved successfully",
        data: detail,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SuperAdminPaymentsController();

