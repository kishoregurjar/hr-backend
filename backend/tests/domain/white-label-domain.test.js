"use strict";

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.JWT_ACCESS_SECRET = "mock_access_secret_1234567890123456";
process.env.JWT_REFRESH_SECRET = "mock_refresh_secret_1234567890123456";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.REDIS_URL = "redis://localhost:6379";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeDomainString,
  resolveCompanyOrigin,
  resolveDomainIdentifier,
  buildCompanyTenantUrl,
} = require("../../src/utils/tenant-url");

const {
  createSuperAdminCompanySchema,
} = require("../../src/modules/super-admin/super-admin.company.validator");

const {
  mapSuperAdminCompany,
  mapCompanyListItem,
  mapCompanyDetail,
} = require("../../src/modules/super-admin/super-admin.company.mapper");

const corsOptions = require("../../src/config/cors");

test("normalizeDomainString normalizes diverse domain inputs correctly", () => {
  assert.equal(normalizeDomainString("https://FacebookCompany.com/careers"), "facebookcompany.com");
  assert.equal(normalizeDomainString("http://sub.acme.co.uk:8080/path?query=1"), "sub.acme.co.uk");
  assert.equal(normalizeDomainString("  GAMMAEDGE.COM  "), "gammaedge.com");
  assert.equal(normalizeDomainString(""), null);
  assert.equal(normalizeDomainString(null), null);
});

test("resolveCompanyOrigin in Local Development mode", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    // 1. Option A: HireQuest Subdomain
    const subdomainComp = { slug: "facebook", customDomain: null, customDomainVerified: false };
    assert.equal(resolveCompanyOrigin(subdomainComp), "http://facebook.localhost:3000");

    // 2. Option B: Custom Domain (local simulation works even if customDomainVerified is false)
    const customComp = { slug: "facebook", customDomain: "facebookcompany.com", customDomainVerified: false };
    assert.equal(resolveCompanyOrigin(customComp), "http://facebookcompany.localhost:3000");

    // 3. Platform Root Fallback
    assert.equal(resolveCompanyOrigin(null), "http://localhost:3000");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("resolveCompanyOrigin in Production mode", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    // 1. Option A: Subdomain
    const subComp = { slug: "facebook", customDomain: null, customDomainVerified: false };
    assert.equal(resolveCompanyOrigin(subComp), "https://facebook.hirequest.com");

    // 2. Option B: Verified Custom Domain
    const verifiedCustomComp = { slug: "facebook", customDomain: "facebookcompany.com", customDomainVerified: true };
    assert.equal(resolveCompanyOrigin(verifiedCustomComp), "https://facebookcompany.com");

    // 3. Option B: Unverified Custom Domain falls back to Subdomain in production
    const unverifiedCustomComp = { slug: "facebook", customDomain: "facebookcompany.com", customDomainVerified: false };
    assert.equal(resolveCompanyOrigin(unverifiedCustomComp), "https://facebook.hirequest.com");

    // 4. Platform Root Fallback
    assert.equal(resolveCompanyOrigin(null), "https://hirequest.com");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("resolveDomainIdentifier correctly parses hostnames", () => {
  // Localhost subdomains
  assert.equal(resolveDomainIdentifier("facebook.localhost:3000"), "facebook");
  assert.equal(resolveDomainIdentifier("facebookcompany.localhost:3000"), "facebookcompany");
  assert.equal(resolveDomainIdentifier("localhost:3000"), null);

  // Production subdomains
  assert.equal(resolveDomainIdentifier("facebook.hirequest.com"), "facebook");
  assert.equal(resolveDomainIdentifier("app.hirequest.com"), null);
  assert.equal(resolveDomainIdentifier("hirequest.com"), null);

  // Custom enterprise domains
  assert.equal(resolveDomainIdentifier("facebookcompany.com"), "facebookcompany.com");
  assert.equal(resolveDomainIdentifier("careers.microsoft.com:443"), "careers.microsoft.com");
});

test("buildCompanyTenantUrl attaches path and parameters", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const comp = { slug: "acme", customDomain: null };
    const url = buildCompanyTenantUrl(comp, "/activate-owner", { token: "secret123" });
    assert.match(url, /^http:\/\/acme\.localhost:3000\/activate-owner\?/);
    assert.match(url, /token=secret123/);
    assert.match(url, /tenant=acme/);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("superAdminCompanyValidator validates domain modes correctly", () => {
  // 1. Valid SUBDOMAIN mode (no custom domain required)
  const validSubdomain = createSuperAdminCompanySchema.safeParse({
    companyName: "Acme Corp",
    ownerEmail: "owner@acme.com",
    domainMode: "SUBDOMAIN",
  });
  assert.equal(validSubdomain.success, true);

  // 2. Valid CUSTOM_DOMAIN mode
  const validCustom = createSuperAdminCompanySchema.safeParse({
    companyName: "Facebook Company",
    ownerEmail: "mark@facebookcompany.com",
    domainMode: "CUSTOM_DOMAIN",
    customDomain: "facebookcompany.com",
  });
  assert.equal(validCustom.success, true);

  // 3. Invalid CUSTOM_DOMAIN mode (missing customDomain)
  const missingCustom = createSuperAdminCompanySchema.safeParse({
    companyName: "Facebook Company",
    ownerEmail: "mark@facebookcompany.com",
    domainMode: "CUSTOM_DOMAIN",
  });
  assert.equal(missingCustom.success, false);

  // 4. Invalid CUSTOM_DOMAIN mode (reserved platform domain)
  const reservedCustom = createSuperAdminCompanySchema.safeParse({
    companyName: "Fake HireQuest",
    ownerEmail: "admin@fake.com",
    domainMode: "CUSTOM_DOMAIN",
    customDomain: "hirequest.com",
  });
  assert.equal(reservedCustom.success, false);
});

test("superAdminCompanyMapper exposes domainMode, customDomain, and localPreviewUrl", () => {
  const mockCompany = {
    id: "comp-123",
    name: "Facebook Company",
    slug: "facebook",
    customDomain: "facebookcompany.com",
    customDomainVerified: false,
    status: "ACTIVE",
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const mapped = mapSuperAdminCompany(mockCompany);
    assert.equal(mapped.domainMode, "CUSTOM_DOMAIN");
    assert.equal(mapped.customDomain, "facebookcompany.com");
    assert.equal(mapped.customDomainVerified, false);
    assert.equal(mapped.localPreviewUrl, "http://facebookcompany.localhost:3000");

    const mappedListItem = mapCompanyListItem(mockCompany);
    assert.equal(mappedListItem.domainMode, "CUSTOM_DOMAIN");
    assert.equal(mappedListItem.localPreviewUrl, "http://facebookcompany.localhost:3000");

    const mappedDetail = mapCompanyDetail(mockCompany);
    assert.equal(mappedDetail.domainMode, "CUSTOM_DOMAIN");
    assert.equal(mappedDetail.customDomain, "facebookcompany.com");
    assert.equal(mappedDetail.localPreviewUrl, "http://facebookcompany.localhost:3000");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("CORS policy allows tenant identifier headers", () => {
  assert.ok(corsOptions.allowedHeaders.includes("X-Tenant-Identifier"));
  assert.ok(corsOptions.allowedHeaders.includes("X-Tenant-Domain"));
  assert.ok(corsOptions.allowedHeaders.includes("X-Tenant-Slug"));
});
