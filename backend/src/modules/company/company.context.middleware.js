"use strict";

const { resolveCompanyContext } = require("./company.context");

const companyContext = async (req, res, next) => {
  try {
    const userId = req.user?.id;

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
      req.query?.companyId;

    const context = await resolveCompanyContext(userId, companyId);

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
