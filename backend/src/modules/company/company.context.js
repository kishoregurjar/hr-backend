"use strict";

const companyRepository = require("./company.repository");
const { COMPANY_CONSTANTS } = require("./company.constants");

const { AppError } = require("../../utils/app-error");

const createCompanyContextError = (message, code, statusCode) => {
  return new AppError(message, {
    statusCode: statusCode || 400,
    code: code || "COMPANY_CONTEXT_ERROR",
    isOperational: true,
  });
};

const resolveCompanyContext = async (userId, companyId) => {
  let targetCompanyId = companyId;

  if (!targetCompanyId) {
    console.time('[TIMING] CompanyContext-Query1');
    const userCompany = await companyRepository.findCompanyByMemberUserId(userId);
    console.timeEnd('[TIMING] CompanyContext-Query1');
    if (userCompany) {
      targetCompanyId = userCompany.id;
    }
  }

  if (!targetCompanyId) {
    throw createCompanyContextError(
      "Company context is required",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      400
    );
  }

  console.time('[TIMING] CompanyContext-Query2');
  const company = await companyRepository.findCompanyContext(
    targetCompanyId,
    userId
  );
  console.timeEnd('[TIMING] CompanyContext-Query2');

  if (!company || !company.members || !company.members.length) {
    throw createCompanyContextError(
      "Company access denied",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      403
    );
  }

  if (company.status === "SUSPENDED") {
    throw createCompanyContextError(
      "This company has been suspended. Please contact platform support.",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_SUSPENDED || "COMPANY_SUSPENDED",
      403
    );
  }

  return {
    company,
    member: company.members[0],
  };
};

module.exports = {
  resolveCompanyContext,
};
