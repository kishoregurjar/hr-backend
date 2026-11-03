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
    let companyId =
      req.headers["x-company-id"] ||
      req.query?.companyId ||
      req.body?.companyId;

    // Resilient fallback for HR & workspace owners: resolve to active company membership
    if (!companyId && !isSuperAdmin && Array.isArray(req.user?.companyMembers) && req.user.companyMembers.length > 0) {
      const activeMember =
        req.user.companyMembers.find(
          (m) =>
            (m.role === "OWNER" || m.role === "COMPANY_OWNER") &&
            m.company?.status !== "SUSPENDED"
        ) ||
        req.user.companyMembers.find((m) => m.company?.status !== "SUSPENDED") ||
        req.user.companyMembers[0];

      if (activeMember?.companyId) {
        companyId = activeMember.companyId;
      }
    }

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
