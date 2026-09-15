"use strict";

function createOverviewDto(data) {
  return {
    success: true,
    data,
  };
}

function createDistributionDto(data) {
  return {
    success: true,
    data,
  };
}

function createGameAnalyticsDto(data) {
  return {
    success: true,
    data,
  };
}

function createQuestionAnalyticsDto(data) {
  return {
    success: true,
    data: data.rows,
    pagination: data.pagination,
  };
}

module.exports = {
  createOverviewDto,
  createDistributionDto,
  createGameAnalyticsDto,
  createQuestionAnalyticsDto,
};
