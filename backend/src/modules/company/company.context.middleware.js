"use strict";

const { resolveCompanyContext } = require("./company.context");

const companyContext = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";

    if (!userId) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      return next(error);
    }

    /*
     * Accept x-company-id header (Node.js lowercases all headers)
     * or companyId query param as fallback.
     */
    const companyId =
      req.headers["x-company-id"] ||
      req.query?.companyId ||
      req.body?.companyId;

    if (!companyId) {
      const error = new Error("Active company context (X-Company-Id header) is required");
      error.code = "COMPANY_CONTEXT_REQUIRED";
      error.statusCode = 400;
      return next(error);
    }

    const context = await resolveCompanyContext(userId, companyId, isSuperAdmin);

    req.company = context.company;
    req.companyMember = context.member;
    req.companyId = context.company.id;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  companyContext,
};
