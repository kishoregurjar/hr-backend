"use strict";

const dashboardService = require("./super-admin.dashboard.service");

const getDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getDashboard();
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getCompanyStatistics = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const result = await dashboardService.getCompanyStatistics(companyId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getCompanyStatistics,
};
