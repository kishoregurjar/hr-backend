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
 * Extracts local dev port from configured frontend URL (default: 3000)
 */
function getLocalDevPort() {
  const fallbackUrl = env.frontend?.url || process.env.CLIENT_URL || "http://localhost:3000";
  try {
    const parsed = new URL(fallbackUrl);
    return parsed.port || "3000";
  } catch {
    return "3000";
  }
}

/**
 * Resolves the base origin URL for a specific company tenant.
 *
 * Environment-aware rules:
 *
 * 1. LOCAL DEVELOPMENT (process.env.NODE_ENV !== "production"):
 *    - Custom Domain: local simulation "http://<simName>.localhost:<port>"
 *      (Simulation works locally even if customDomainVerified is false).
 *    - Subdomain: "http://<slug>.localhost:<port>"
 *    - Fallback: "http://localhost:<port>"
 *
 * 2. PRODUCTION (process.env.NODE_ENV === "production"):
 *    - Custom Domain: "https://<customDomain>" ONLY IF customDomainVerified === true.
 *    - Subdomain: "https://<slug>.<rootDomain>" (also used as fallback for unverified custom domains).
 *    - Fallback: "https://<rootDomain>"
 */
function resolveCompanyOrigin(company) {
  const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.replace(/\/+$/, "") : null;
  const isVercelDomain = clientUrl && clientUrl.includes(".vercel.app");
  const hasCustomWildcardDomain = Boolean(
    process.env.ROOT_DOMAIN &&
    !process.env.ROOT_DOMAIN.includes("vercel.app") &&
    process.env.ROOT_DOMAIN !== "hirequest.com"
  );
  const rootDomain = (process.env.ROOT_DOMAIN || "hirequest.com").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";
  const devPort = getLocalDevPort();
  const localRootOrigin = `http://localhost:${devPort}`;
  const prodRootOrigin = clientUrl || `https://${rootDomain}`;

  if (!company) {
    return isProduction ? prodRootOrigin : localRootOrigin;
  }

  // If company explicitly specifies SUBDOMAIN mode, prefer slug over customDomain
  if (company.domainMode === "SUBDOMAIN") {
    const slug = company.slug ? company.slug.trim().toLowerCase() : null;
    if (isProduction) {
      if (hasCustomWildcardDomain && slug) {
        return `https://${slug}.${rootDomain}`;
      }
      return prodRootOrigin;
    }
    return slug ? `http://${slug}.localhost:${devPort}` : localRootOrigin;
  }

  const customDomain = company.customDomain ? normalizeDomainString(company.customDomain) : null;
  const slug = company.slug ? company.slug.trim().toLowerCase() : null;

  if (isProduction) {
    // In production, custom domain is only honored if verified
    if (customDomain && company.customDomainVerified === true) {
      return `https://${customDomain}`;
    }
    // Subdomain fallback if custom wildcard domain exists
    if (hasCustomWildcardDomain && slug) {
      return `https://${slug}.${rootDomain}`;
    }
    return prodRootOrigin;
  }

  // Local Development Simulation
  if (customDomain) {
    const simName = customDomain.split(".")[0];
    return `http://${simName}.localhost:${devPort}`;
  }

  if (slug) {
    return `http://${slug}.localhost:${devPort}`;
  }

  return localRootOrigin;
}

/**
 * Resolves tenant identifier from incoming hostname (used for server-side resolution)
 */
function resolveDomainIdentifier(host) {
  if (!host || typeof host !== "string") return null;
  const hostname = host.replace(/:\d+$/, "").toLowerCase().trim();
  const rootDomain = (process.env.ROOT_DOMAIN || "hirequest.com").toLowerCase();

  // 1. Localhost development: e.g. "facebook.localhost" or "facebookcompany.localhost"
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2 && parts[0] && parts[0] !== "www") {
      return parts[0];
    }
  }

  // 2. Production subdomain: e.g. "facebook.hirequest.com"
  if (hostname.endsWith(`.${rootDomain}`)) {
    const sub = hostname.replace(new RegExp(`\\.${rootDomain}$`), "").split(".").pop();
    if (sub && !["www", "admin", "api", "app", "staging"].includes(sub)) {
      return sub;
    }
  }

  // 3. Custom external domain: e.g. "facebookcompany.com"
  const ignoredRoots = ["localhost", "127.0.0.1", rootDomain, `app.${rootDomain}`, `www.${rootDomain}`];
  if (!ignoredRoots.includes(hostname)) {
    return hostname;
  }

  return null;
}

/**
 * Constructs a fully qualified URL for a company tenant route with query params.
 * e.g. buildCompanyTenantUrl(company, "/activate-owner", { token: "abc123" })
 */
function buildCompanyTenantUrl(company, pathname = "/", queryParams = {}) {
  const origin = resolveCompanyOrigin(company);
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(cleanPath, origin);

  // If in local development OR if using single-domain deployment (e.g. *.vercel.app),
  // attach ?tenant=<slug> so company workspace context is preserved on platform root
  if (company?.slug) {
    const urlHostname = url.hostname.toLowerCase();
    const isDedicatedSubdomain = urlHostname.startsWith(`${company.slug.toLowerCase()}.`);

    // Attach ?tenant= whenever not already on a dedicated subdomain
    if (!isDedicatedSubdomain || process.env.NODE_ENV !== "production") {
      url.searchParams.set("tenant", company.slug);
    }
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
  getLocalDevPort,
  resolveCompanyOrigin,
  resolveDomainIdentifier,
  buildCompanyTenantUrl,
};
