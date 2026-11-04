"use strict";

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.JWT_ACCESS_SECRET = "mock_access_secret_1234567890123456";
process.env.JWT_REFRESH_SECRET = "mock_refresh_secret_1234567890123456";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.ROOT_DOMAIN = "hirequest.com";
process.env.REDIS_URL = "redis://localhost:6379";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCompanyTenantUrl,
  resolveCompanyOrigin,
  normalizeDomainString,
  resolveDomainIdentifier,
} = require("../../src/utils/tenant-url");

// Mock fixtures
const mockFacebookSubdomain = {
  id: "comp-fb-001",
  name: "Facebook",
  slug: "facebook",
  domainMode: "SUBDOMAIN",
  customDomain: null,
  customDomainVerified: false,
};

const mockMicrosoftCustomDomain = {
  id: "comp-ms-002",
  name: "Microsoft",
  slug: "microsoft",
  domainMode: "CUSTOM_DOMAIN",
  customDomain: "microspft-company",
  customDomainVerified: false,
};

const mockGammaedgeCustomDomain = {
  id: "comp-ge-003",
  name: "Gammaedge",
  slug: "gammaedge",
  domainMode: "CUSTOM_DOMAIN",
  customDomain: "gammaedge.com",
  customDomainVerified: false,
};

// ─── Phase 4 Test Suite ────────────────────────────────────────────────────────

test("1. Owner activation URL for SUBDOMAIN mode", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const rawToken = "raw_activation_token_subdomain_12345";
    const activationUrl = buildCompanyTenantUrl(mockFacebookSubdomain, "/activate-owner", {
      token: rawToken,
    });

    const parsed = new URL(activationUrl);
    assert.equal(parsed.protocol, "http:");
    assert.equal(parsed.host, "facebook.localhost:3000");
    assert.equal(parsed.pathname, "/activate-owner");
    assert.equal(parsed.searchParams.get("token"), rawToken);
    assert.equal(parsed.searchParams.get("tenant"), "facebook");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("2. Owner activation URL for CUSTOM_DOMAIN simulation", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const rawToken = "raw_activation_token_custom_67890";
    const activationUrl = buildCompanyTenantUrl(mockMicrosoftCustomDomain, "/activate-owner", {
      token: rawToken,
    });

    const parsed = new URL(activationUrl);
    assert.equal(parsed.protocol, "http:");
    assert.equal(parsed.host, "microspft-company.localhost:3000");
    assert.equal(parsed.pathname, "/activate-owner");
    assert.equal(parsed.searchParams.get("token"), rawToken);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("3. HR invitation URL for SUBDOMAIN mode", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const rawToken = "invitation_token_subdomain_abc";
    const invitationId = "inv_subdomain_123";
    const invitationUrl = buildCompanyTenantUrl(mockFacebookSubdomain, "/accept-invitation", {
      invitation: invitationId,
      token: rawToken,
    });

    const parsed = new URL(invitationUrl);
    assert.equal(parsed.protocol, "http:");
    assert.equal(parsed.host, "facebook.localhost:3000");
    assert.equal(parsed.pathname, "/accept-invitation");
    assert.equal(parsed.searchParams.get("invitation"), invitationId);
    assert.equal(parsed.searchParams.get("token"), rawToken);
    assert.equal(parsed.searchParams.get("tenant"), "facebook");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("4. HR invitation URL for CUSTOM_DOMAIN simulation", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const rawToken = "invitation_token_custom_def";
    const invitationId = "inv_custom_456";
    const invitationUrl = buildCompanyTenantUrl(mockGammaedgeCustomDomain, "/accept-invitation", {
      invitation: invitationId,
      token: rawToken,
    });

    const parsed = new URL(invitationUrl);
    assert.equal(parsed.protocol, "http:");
    assert.equal(parsed.host, "gammaedge.localhost:3000");
    assert.equal(parsed.pathname, "/accept-invitation");
    assert.equal(parsed.searchParams.get("invitation"), invitationId);
    assert.equal(parsed.searchParams.get("token"), rawToken);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("5. Candidate assessment URL for the correct company", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const assessmentToken = "candidate_raw_token_xyz999";

    // 5a. Microsoft custom domain simulation
    const msAssessmentUrl = buildCompanyTenantUrl(mockMicrosoftCustomDomain, "/take-test", {
      token: assessmentToken,
    });
    const parsedMs = new URL(msAssessmentUrl);
    assert.equal(parsedMs.protocol, "http:");
    assert.equal(parsedMs.host, "microspft-company.localhost:3000");
    assert.equal(parsedMs.pathname, "/take-test");
    assert.equal(parsedMs.searchParams.get("token"), assessmentToken);

    // 5b. Facebook subdomain
    const fbAssessmentUrl = buildCompanyTenantUrl(mockFacebookSubdomain, "/take-test", {
      token: assessmentToken,
    });
    const parsedFb = new URL(fbAssessmentUrl);
    assert.equal(parsedFb.protocol, "http:");
    assert.equal(parsedFb.host, "facebook.localhost:3000");
    assert.equal(parsedFb.pathname, "/take-test");
    assert.equal(parsedFb.searchParams.get("token"), assessmentToken);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("6. Password reset URL for the correct tenant", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const resetToken = "reset_password_raw_token_555";

    // Tenant user on Microsoft
    const msResetUrl = buildCompanyTenantUrl(mockMicrosoftCustomDomain, "/reset-password", {
      token: resetToken,
    });
    const parsedMs = new URL(msResetUrl);
    assert.equal(parsedMs.host, "microspft-company.localhost:3000");
    assert.equal(parsedMs.pathname, "/reset-password");
    assert.equal(parsedMs.searchParams.get("token"), resetToken);

    // Tenant user on Facebook
    const fbResetUrl = buildCompanyTenantUrl(mockFacebookSubdomain, "/reset-password", {
      token: resetToken,
    });
    const parsedFb = new URL(fbResetUrl);
    assert.equal(parsedFb.host, "facebook.localhost:3000");
    assert.equal(parsedFb.pathname, "/reset-password");
    assert.equal(parsedFb.searchParams.get("token"), resetToken);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("7. Company support notification URL", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    // HR ticket -> Company Owner Dashboard on tenant domain
    const ownerDashboardUrl = buildCompanyTenantUrl(mockMicrosoftCustomDomain, "/support-tickets");
    const parsed = new URL(ownerDashboardUrl);
    assert.equal(parsed.host, "microspft-company.localhost:3000");
    assert.equal(parsed.pathname, "/support-tickets");

    // Owner ticket -> Super Admin Dashboard on platform root
    const superAdminDashboardUrl = buildCompanyTenantUrl(null, "/admin/support");
    const parsedRoot = new URL(superAdminDashboardUrl);
    assert.equal(parsedRoot.host, "localhost:3000");
    assert.equal(parsedRoot.pathname, "/admin/support");
    assert.equal(parsedRoot.searchParams.get("tenant"), null);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("8. Platform Super Admin email still uses platform root", () => {
  const originalEnv = process.env.NODE_ENV;

  try {
    // 8a. In Local Development
    process.env.NODE_ENV = "development";
    const localAdminActivation = buildCompanyTenantUrl(null, "/activate-owner", {
      token: "superadmin_token_123",
    });
    const parsedLocal = new URL(localAdminActivation);
    assert.equal(parsedLocal.protocol, "http:");
    assert.equal(parsedLocal.host, "localhost:3000");
    assert.equal(parsedLocal.pathname, "/activate-owner");
    assert.equal(parsedLocal.searchParams.get("token"), "superadmin_token_123");
    assert.equal(parsedLocal.searchParams.get("tenant"), null);

    // 8b. In Production
    process.env.NODE_ENV = "production";
    const prodAdminActivation = buildCompanyTenantUrl(null, "/activate-owner", {
      token: "superadmin_token_123",
    });
    const parsedProd = new URL(prodAdminActivation);
    assert.equal(parsedProd.protocol, "https:");
    assert.equal(parsedProd.host, "hirequest.com");
    assert.equal(parsedProd.pathname, "/activate-owner");
    assert.equal(parsedProd.searchParams.get("token"), "superadmin_token_123");
    assert.equal(parsedProd.searchParams.get("tenant"), null);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("9. Production verified custom domain URL", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const verifiedCompany = {
      id: "comp-prod-001",
      name: "Acme Enterprises",
      slug: "acme",
      customDomain: "careers.acme.com",
      customDomainVerified: true,
    };

    const token = "verified_domain_token_111";
    const url = buildCompanyTenantUrl(verifiedCompany, "/activate-owner", { token });

    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.host, "careers.acme.com");
    assert.equal(parsed.pathname, "/activate-owner");
    assert.equal(parsed.searchParams.get("token"), token);
    assert.equal(parsed.searchParams.get("tenant"), null);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("10. Production unverified custom domain fallback", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const unverifiedCompany = {
      id: "comp-prod-002",
      name: "Pending Corp",
      slug: "pending-corp",
      customDomain: "pendingcorp.com",
      customDomainVerified: false,
    };

    const token = "unverified_fallback_token_222";
    const url = buildCompanyTenantUrl(unverifiedCompany, "/accept-invitation", { token });

    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    // Must fall back to company subdomain on the root domain
    assert.equal(parsed.host, "pending-corp.hirequest.com");
    assert.equal(parsed.pathname, "/accept-invitation");
    assert.equal(parsed.searchParams.get("token"), token);
    assert.equal(parsed.searchParams.get("tenant"), null);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("11. Invitation tokens remain scoped to their company", () => {
  const fbInvitationUrl = buildCompanyTenantUrl(mockFacebookSubdomain, "/accept-invitation", {
    invitation: "inv-fb-101",
    token: "fb-secret-token",
  });
  const msInvitationUrl = buildCompanyTenantUrl(mockMicrosoftCustomDomain, "/accept-invitation", {
    invitation: "inv-ms-202",
    token: "ms-secret-token",
  });

  const parsedFb = new URL(fbInvitationUrl);
  const parsedMs = new URL(msInvitationUrl);

  // Different origins prevent token reuse across different company origins
  assert.notEqual(parsedFb.origin, parsedMs.origin);
  assert.equal(parsedFb.searchParams.get("invitation"), "inv-fb-101");
  assert.equal(parsedMs.searchParams.get("invitation"), "inv-ms-202");
});

test("12. No hardcoded Railway or localhost URL leaks into production URL generation", () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const companiesToTest = [
      mockFacebookSubdomain,
      mockMicrosoftCustomDomain,
      mockGammaedgeCustomDomain,
      { slug: "alpha", customDomain: "alpha.org", customDomainVerified: true },
      null, // Platform root
    ];

    const routesToTest = ["/activate-owner", "/accept-invitation", "/take-test", "/reset-password", "/admin/support"];

    for (const comp of companiesToTest) {
      for (const route of routesToTest) {
        const generatedUrl = buildCompanyTenantUrl(comp, route, { token: "safe-token" });

        // Must start with https://
        assert.ok(
          generatedUrl.startsWith("https://"),
          `Expected https:// for ${generatedUrl}`
        );

        // Must NOT leak localhost
        assert.ok(
          !generatedUrl.includes("localhost"),
          `Leaked localhost in production URL: ${generatedUrl}`
        );

        // Must NOT leak Railway
        assert.ok(
          !generatedUrl.includes("railway.app"),
          `Leaked railway.app in production URL: ${generatedUrl}`
        );

        // Must NOT leak IP addresses
        assert.ok(
          !generatedUrl.includes("127.0.0.1"),
          `Leaked 127.0.0.1 in production URL: ${generatedUrl}`
        );
      }
    }
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

