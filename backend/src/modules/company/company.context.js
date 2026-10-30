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

const resolveCompanyContext = async (userId, companyId, isSuperAdmin = false) => {
  if (!companyId || typeof companyId !== "string" || !companyId.trim()) {
    throw createCompanyContextError(
      "Active company context (X-Company-Id header or companyId parameter) is required",
      "COMPANY_CONTEXT_REQUIRED",
      400
    );
  }

  const cleanCompanyId = companyId.trim();
  const cacheKey = `${userId}:${cleanCompanyId}:${isSuperAdmin ? "superadmin" : "member"}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let company = null;

  if (isSuperAdmin) {
    company = await companyRepository.findCompanyById(cleanCompanyId);
    if (company && (!company.members || !company.members.length)) {
      company.members = [{ role: "OWNER", userId }];
    }
  } else {
    company = await companyRepository.findCompanyContext(cleanCompanyId, userId);
  }

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
