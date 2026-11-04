"use strict";

const companyRepository = require("./company.repository");
const { resolveDomainIdentifier } = require("../../utils/tenant-url");
const { AppError } = require("../../utils/app-error");

/**
 * Extracts candidate host from incoming request in order of trust:
 * 1. req.headers.origin (browser-enforced origin, e.g. "http://facebook.localhost:3000")
 * 2. req.headers.referer (browser-enforced referer)
 * 3. req.headers["x-forwarded-host"] (reverse proxy hop)
 * 4. req.headers.host (direct HTTP host)
 */

function isPlatformRootHost(host) {
  if (!host || typeof host !== "string") return false;
  const hostname = host.replace(/:\d+$/, "").toLowerCase().trim();
  const rootDomain = (process.env.ROOT_DOMAIN || "hirequest.com").toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === rootDomain ||
    hostname === `www.${rootDomain}` ||
    hostname === `app.${rootDomain}` ||
    hostname === `admin.${rootDomain}`
  );
}

function extractHostFromRequest(req) {
  if (!req || !req.headers) return null;

  // 1. Browser Origin (highest fidelity for CORS / browser app requests)
  const origin = req.headers.origin;
  if (origin && typeof origin === "string") {
    try {
      const parsed = new URL(origin);
      if (parsed.host) return parsed.host;
    } catch {}
  }

  // 2. Browser Referer
  const referer = req.headers.referer;
  if (referer && typeof referer === "string") {
    try {
      const parsed = new URL(referer);
      if (parsed.host) return parsed.host;
    } catch {}
  }

  // 3. Proxy-forwarded host
  const forwardedHost = req.headers["x-forwarded-host"];
  if (forwardedHost && typeof forwardedHost === "string") {
    return forwardedHost.split(",")[0].trim();
  }

  // 4. Standard Host header
  const host = req.headers.host;
  if (host && typeof host === "string") {
    return host.trim();
  }

  return null;
}

/**
 * Resolves the authoritative company tenant associated with an incoming HTTP request.
 *
 * Rules:
 * 1. Checks trusted server-side origin/host sources.
 * 2. If host resolves to root platform (e.g. localhost:3000, app.hirequest.com), returns null.
 * 3. If no tenant detected from host/origin/referer, inspects X-Tenant-Identifier fallback.
 *    (If host/origin WAS present and resolved to a tenant, client-controlled headers CANNOT override it).
 * 4. Resolves the identifier against the database via findCompanyBySlug.
 *    - Unknown tenant -> throws 404 TENANT_NOT_FOUND.
 *    - Suspended tenant -> throws 403 COMPANY_SUSPENDED.
 *
 * @param {import("express").Request} req
 * @returns {Promise<Object|null>} Resolved company record or null if platform root
 */
async function resolveTenantFromRequest(req) {
  if (!req) return null;

  // Cache resolved tenant on the request object for the duration of the request lifecycle
  if (req._resolvedTenant !== undefined) {
    return req._resolvedTenant;
  }

  const rawHost = extractHostFromRequest(req);

  // If host/origin is explicitly the platform root, NEVER allow client headers to override it
  if (rawHost && isPlatformRootHost(rawHost)) {
    req._resolvedTenant = null;
    return null;
  }

  let tenantIdentifier = rawHost ? resolveDomainIdentifier(rawHost) : null;

  // Fallback ONLY when no host or origin was present at all (e.g. test harness / server-to-server)
  if (!tenantIdentifier && !rawHost && req.headers && req.headers["x-tenant-identifier"]) {
    const headerVal = req.headers["x-tenant-identifier"].trim();
    tenantIdentifier = resolveDomainIdentifier(headerVal) || headerVal.toLowerCase();
  }

  // If no tenant identifier, request is on platform root (e.g. localhost:3000, app.hirequest.com)
  if (!tenantIdentifier) {
    req._resolvedTenant = null;
    return null;
  }

  // Resolve against database using findCompanyBySlug (matches slug, customDomain, and dev simulation prefix)
  const company = await companyRepository.findCompanyBySlug(tenantIdentifier);

  if (!company) {
    throw new AppError("Unknown or invalid organization workspace.", {
      statusCode: 404,
      code: "TENANT_NOT_FOUND",
      isOperational: true,
    });
  }

  if (company.status === "SUSPENDED") {
    throw new AppError("This organization has been suspended. Please contact platform support.", {
      statusCode: 403,
      code: "COMPANY_SUSPENDED",
      isOperational: true,
    });
  }

  req._resolvedTenant = company;
  return company;
}

module.exports = {
  extractHostFromRequest,
  resolveTenantFromRequest,
};

