"use strict";

const { resolveCompanyContext } = require("./company.context");
const { resolveTenantFromRequest } = require("./company.tenant-resolver");

/**
 * Enterprise Multi-Tenant Boundary Enforcement Middleware
 *
 * Responsibilities:
 * 1. Derives authoritative tenant from trusted server-side request context (Host/Origin/Referer).
 * 2. Enforces that client-controlled headers (X-Company-Id, X-Tenant-Identifier) NEVER bypass validation.
 * 3. Enforces that access tokens bound to tenant A cannot be reused on tenant B (HTTP 403).
 * 4. Rejects mismatched client-sent X-Company-Id with HTTP 403.
 * 5. Validates active user membership in the company context before granting access.
 * 6. Supports Platform Super Admin access on root domains without forcing unnecessary tenant bindings.
 */
const companyContext = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const isSuperAdmin = req.user?.role === "SUPER_ADMIN";

    if (!userId) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      return next(error);
    }

    // 1. Resolve expected tenant from trusted server-side request context (Host/Origin/Referer)
    const expectedTenant = await resolveTenantFromRequest(req);

    // 2. Client-provided company ID from headers/query/body
    const clientCompanyId =
      req.headers["x-company-id"] ||
      req.headers["X-Company-Id"] ||
      req.query?.companyId ||
      req.body?.companyId;

    let targetCompanyId = null;

    if (expectedTenant) {
      // Request is bound to a tenant domain (e.g. facebook.localhost:3000 or facebookcompany.localhost:3000)
      // Client-provided X-Company-Id MUST match the resolved tenant if provided
      if (clientCompanyId && clientCompanyId !== expectedTenant.id) {
        const error = new Error("Requested company context (X-Company-Id) does not match the active organization domain.");
        error.code = "TENANT_MISMATCH";
        error.statusCode = 403;
        return next(error);
      }

      // Check if access token was bound to a specific tenant
      if (req.tokenCompanyId && req.tokenCompanyId !== expectedTenant.id && !isSuperAdmin) {
        const error = new Error("Access token was issued for a different organization.");
        error.code = "TOKEN_TENANT_MISMATCH";
        error.statusCode = 403;
        return next(error);
      }

      // Authoritative company ID is the server-resolved tenant
      targetCompanyId = expectedTenant.id;
    } else {
      // Request is on platform root (e.g. localhost:3000 or app.hirequest.com)
      if (clientCompanyId) {
        if (req.tokenCompanyId && req.tokenCompanyId !== clientCompanyId && !isSuperAdmin) {
          const error = new Error("Access token was issued for a different organization.");
          error.code = "TOKEN_TENANT_MISMATCH";
          error.statusCode = 403;
          return next(error);
        }
        targetCompanyId = clientCompanyId;
      } else if (!isSuperAdmin && Array.isArray(req.user?.companyMembers) && req.user.companyMembers.length > 0) {
        const activeMember =
          req.user.companyMembers.find(
            (m) =>
              (m.role === "OWNER" || m.role === "COMPANY_OWNER") &&
              m.company?.status !== "SUSPENDED"
          ) ||
          req.user.companyMembers.find((m) => m.company?.status !== "SUSPENDED") ||
          req.user.companyMembers[0];

        if (activeMember?.companyId) {
          targetCompanyId = activeMember.companyId;
        }
      }
    }

    if (!targetCompanyId) {
      const error = new Error("Active company context (X-Company-Id header) is required");
      error.code = "COMPANY_CONTEXT_REQUIRED";
      error.statusCode = 400;
      return next(error);
    }

    // 3. Resolve and validate user's active membership in targetCompanyId
    const context = await resolveCompanyContext(userId, targetCompanyId, isSuperAdmin);

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
