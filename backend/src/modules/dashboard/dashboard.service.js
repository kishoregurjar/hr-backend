"use strict";

const dashboardRepository = require("./dashboard.repository");

async function getDashboardOverview({ userId, companyId }) {
  return dashboardRepository.getDashboardOverviewData({ userId, companyId });
}

module.exports = {
  getDashboardOverview,
};
