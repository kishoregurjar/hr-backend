"use strict";

const dashboardRepository = require("./super-admin.dashboard.repository");
const {
  mapPlatformStatistics,
  mapCompanyStatistics,
} = require("./super-admin.dashboard.mapper");
const {
  buildDashboardResponse,
  buildCompanyStatisticsResponse,
} = require("./super-admin.dashboard.dto");
const {
  SUPER_ADMIN_DASHBOARD_CONSTANTS,
} = require("./super-admin.dashboard.constants");

const getDashboard = async () => {
  const statistics = await dashboardRepository.getPlatformStatistics();
  return buildDashboardResponse(mapPlatformStatistics(statistics));
};

const getCompanyStatistics = async (companyId) => {
  const statistics = await dashboardRepository.getCompanyStatistics(companyId);

  if (!statistics.company) {
    const error = new Error(
      SUPER_ADMIN_DASHBOARD_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_DASHBOARD_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  return buildCompanyStatisticsResponse(mapCompanyStatistics(statistics));
};

module.exports = {
  getDashboard,
  getCompanyStatistics,
};
