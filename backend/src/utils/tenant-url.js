"use strict";

const env = require("../config/env");

/**
 * Normalizes a user-input domain or website URL:
 * - strips protocols (http://, https://)
 * - strips trailing slashes, paths, and spaces
 * - converts to lowercase
 * e.g. "https://Careers.Acme.com/jobs" -> "careers.acme.com"
 */
function normalizeDomainString(rawDomain) {
  if (!rawDomain || typeof rawDomain !== "string") return null;
  let clean = rawDomain.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, "");
  clean = clean.replace(/[:\/].*$/, ""); // strip path and port
  return clean || null;
}

/**
 * Resolves the base origin URL for a specific company tenant.
 *
 * Rules:
 * 1. If verified customDomain is present: "https://careers.acme.com"
 *    (Only used if customDomainVerified is explicitly true).
 * 2. If company slug is present:
 *    - Production: "https://<slug>.<rootDomain>" (e.g. https://acme.hirequest.com)
 *    - Development: Fallback URL (http://localhost:3000), with ?tenant=<slug> query param
 * 3. Fallback: env.frontend.url (http://localhost:3000)
 */
function resolveCompanyOrigin(company) {
  const fallbackUrl = env.frontend?.url || process.env.CLIENT_URL || "http://localhost:3000";
  const rootDomain = process.env.ROOT_DOMAIN || "hirequest.com";
  const isProduction = process.env.NODE_ENV === "production";

  if (!company) {
    return fallbackUrl;
  }

  // 1. Custom Domain (priority ONLY if explicitly verified)
  const customDomain = company.customDomain ? normalizeDomainString(company.customDomain) : null;
  if (customDomain && company.customDomainVerified === true) {
    const protocol = isProduction ? "https:" : "http:";
    return `${protocol}//${customDomain}`;
  }

  // 2. Tenant Subdomain based on Company Slug
  if (company.slug) {
    const cleanSlug = company.slug.trim().toLowerCase();
    if (isProduction) {
      return `https://${cleanSlug}.${rootDomain}`;
    }

    // Development: Use fallback localhost:3000 directly
    return fallbackUrl;
  }

  return fallbackUrl;
}

/**
 * Constructs a fully qualified URL for a company tenant route with query params.
 * e.g. buildCompanyTenantUrl(company, "/activate-owner", { token: "abc123" })
 * -> "http://localhost:3000/activate-owner?token=abc123&tenant=acme"
 */
function buildCompanyTenantUrl(company, pathname = "/", queryParams = {}) {
  const origin = resolveCompanyOrigin(company);
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(cleanPath, origin);

  // If company slug exists, attach tenant query param as an infallible backup
  if (company?.slug) {
    url.searchParams.set("tenant", company.slug);
  }

  if (queryParams && typeof queryParams === "object") {
    for (const [key, val] of Object.entries(queryParams)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val));
      }
    }
  }

  return url.toString();
}

module.exports = {
  normalizeDomainString,
  resolveCompanyOrigin,
  buildCompanyTenantUrl,
};
