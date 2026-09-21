"use strict";

const companyRepository = require("./company.repository");
const { COMPANY_CONSTANTS } = require("./company.constants");

const { AppError } = require("../../utils/app-error");

const contextCache = new Map();
const CONTEXT_CACHE_TTL = 30 * 1000; // 30 seconds

const createCompanyContextError = (message, code, statusCode) => {
  return new AppError(message, {
    statusCode: statusCode || 400,
    code: code || "COMPANY_CONTEXT_ERROR",
    isOperational: true,
  });
};

const resolveCompanyContext = async (userId, companyId) => {
  const cacheKey = `${userId}:${companyId || "default"}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let company = null;

  if (!companyId) {
    company = await companyRepository.findDefaultCompanyContextForUser(userId);
  } else {
    company = await companyRepository.findCompanyContext(companyId, userId);
  }

  if (!company || !company.members || !company.members.length) {
    throw createCompanyContextError(
      "Company access denied",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      companyId ? 403 : 400
    );
  }

  if (company.status === "SUSPENDED") {
    throw createCompanyContextError(
      "This company has been suspended. Please contact platform support.",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_SUSPENDED || "COMPANY_SUSPENDED",
      403
    );
  }

  const result = {
    company,
    member: company.members[0],
  };

  contextCache.set(cacheKey, { data: result, expiresAt: Date.now() + CONTEXT_CACHE_TTL });
  return result;
};

const clearCompanyContextCache = (userId) => {
  if (!userId) return;
  for (const key of contextCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      contextCache.delete(key);
    }
  }
};

module.exports = {
  resolveCompanyContext,
  clearCompanyContextCache,
};
