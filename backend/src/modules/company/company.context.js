"use strict";

const companyRepository = require("./company.repository");
const { COMPANY_CONSTANTS } = require("./company.constants");

const createCompanyContextError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const resolveCompanyContext = async (userId, companyId) => {
  if (!companyId) {
    throw createCompanyContextError(
      "Company context is required",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      400
    );
  }

  const company = await companyRepository.findCompanyContext(
    companyId,
    userId
  );

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
