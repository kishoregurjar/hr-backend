"use strict";

/**
 * End-to-End Verification Test for Subdomain & Custom Domain Architecture
 * File: backend/scripts/verify_subdomain_and_domain_flow.js
 */

const assert = require("assert");
const { prisma } = require("../src/config/prisma");
const {
  normalizeDomainString,
  resolveCompanyOrigin,
  buildCompanyTenantUrl,
} = require("../src/utils/tenant-url");
const {
  createSuperAdminCompanySchema,
} = require("../src/modules/super-admin/super-admin.company.validator");
const {
  buildOwnerWelcomeEmail,
} = require("../src/modules/super-admin/super-admin.owner-welcome.email.template");
const {
  buildInvitationEmail,
} = require("../src/modules/attempt/attempt.email");

async function runVerification() {
  console.log("=================================================================");
  console.log("🔍 Running Subdomain & Custom Domain End-to-End Verification");
  console.log("=================================================================");

  // Test 1: Domain normalization
  console.log("\n[TEST 1] Testing Domain Normalization...");
  assert.strictEqual(normalizeDomainString("https://Acme.com/"), "acme.com");
  assert.strictEqual(normalizeDomainString("http://sub.company.org/careers"), "sub.company.org");
  assert.strictEqual(normalizeDomainString("mybrand.io:8080/test"), "mybrand.io");
  assert.strictEqual(normalizeDomainString(""), null);
  assert.strictEqual(normalizeDomainString(null), null);
  console.log("  ✅ normalizeDomainString passed all assertions.");

  // Test 2: Localhost Subdomain & Custom Domain URL generation
  console.log("\n[TEST 2] Testing Development Tenant URL Generation...");
  const devSlugCompany = { slug: "innovate-labs" };
  const devSlugUrl = buildCompanyTenantUrl(devSlugCompany, "/activate-owner", { token: "token_123" });
  console.log("  -> Generated Dev Subdomain URL:", devSlugUrl);
  assert(devSlugUrl.includes("innovate-labs.localhost"));
  assert(devSlugUrl.includes("/activate-owner"));
  assert(devSlugUrl.includes("token=token_123"));
  assert(devSlugUrl.includes("tenant=innovate-labs"));

  // 2a: Verified Custom Domain in Dev works
  const devCustomCompany = { slug: "innovate-labs", customDomain: "careers.innovate.com", customDomainVerified: true };
  const devCustomUrl = buildCompanyTenantUrl(devCustomCompany, "/take-test", { token: "cand_456" });
  console.log("  -> Generated Dev Custom Domain URL:", devCustomUrl);
  assert(devCustomUrl.includes("careers.innovate.com"));
  assert(devCustomUrl.includes("/take-test"));
  assert(devCustomUrl.includes("token=cand_456"));

  // 2b: Unverified external domain (e.g. gammaedge.com) must NOT hijack workspace origin - falls back to tenant subdomain
  const unverifiedCompany = { slug: "gammaedge", customDomain: "gammaedge.com", customDomainVerified: false };
  const unverifiedUrl = buildCompanyTenantUrl(unverifiedCompany, "/activate-owner", { token: "tok_unverified" });
  console.log("  -> Unverified external domain safely falls back to subdomain URL:", unverifiedUrl);
  assert(!unverifiedUrl.includes("http://gammaedge.com/"));
  assert(unverifiedUrl.includes("gammaedge.localhost"));
  assert(unverifiedUrl.includes("/activate-owner"));
  assert(unverifiedUrl.includes("token=tok_unverified"));
  console.log("  ✅ Development URL generation and unverified domain safety passed.");

  // Test 3: Production Subdomain & Custom Domain URL generation
  console.log("\n[TEST 3] Testing Production Tenant URL Generation...");
  const prevEnv = process.env.NODE_ENV;
  const prevRoot = process.env.ROOT_DOMAIN;
  try {
    process.env.NODE_ENV = "production";
    process.env.ROOT_DOMAIN = "hirequest.com";

    const prodSubUrl = buildCompanyTenantUrl({ slug: "acme" }, "/activate-owner", { token: "tok_prod" });
    console.log("  -> Generated Prod Subdomain URL:", prodSubUrl);
    assert.strictEqual(prodSubUrl, "https://acme.hirequest.com/activate-owner?tenant=acme&token=tok_prod");

    const prodCustomUrl = buildCompanyTenantUrl(
      { slug: "acme", customDomain: "jobs.acme.com", customDomainVerified: true },
      "/take-test",
      { token: "tok_test" }
    );
    console.log("  -> Generated Prod Custom Domain URL:", prodCustomUrl);
    assert.strictEqual(prodCustomUrl, "https://jobs.acme.com/take-test?tenant=acme&token=tok_test");
    console.log("  ✅ Production URL generation passed.");
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.ROOT_DOMAIN = prevRoot;
  }

  // Test 4: Super Admin Company Creation Validator
  console.log("\n[TEST 4] Testing Super Admin Company Validator with Domain inputs...");
  const validPayload = {
    companyName: "Acme Tech Solutions",
    ownerEmail: "owner@acmetech.com",
    domain: "https://acmetech.com/",
    industry: "SaaS & Cloud",
  };
  const parsed = createSuperAdminCompanySchema.parse(validPayload);
  assert.strictEqual(parsed.companyName, "Acme Tech Solutions");
  assert.strictEqual(parsed.domain, "acmetech.com");
  console.log("  ✅ Super Admin validator cleanly parsed and normalized domain:", parsed.domain);

  // Test 5: Owner Activation Email Template Rendering
  console.log("\n[TEST 5] Testing Owner Welcome Email Template with Subdomain Workspace...");
  const emailResult = buildOwnerWelcomeEmail({
    ownerName: "Alice Walker",
    companyName: "Acme Tech Solutions",
    activationUrl: "http://acme-tech.localhost:3000/activate-owner?token=sample_token&tenant=acme-tech",
    company: { slug: "acme-tech", customDomain: null },
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });
  assert(emailResult.subject.includes("Acme Tech Solutions"));
  assert(emailResult.html.includes("acme-tech.localhost:3000"));
  assert(emailResult.html.includes("Activate Workspace"));
  console.log("  ✅ Owner activation email template rendered with dedicated workspace domain.");

  // Test 6: Candidate Assessment Email Template with Company Subdomain Link
  console.log("\n[TEST 6] Testing Candidate Assessment Email with Subdomain Test Link...");
  const testCandidateLink = buildCompanyTenantUrl({ slug: "acme-tech" }, "/take-test", { token: "invite_xyz" });
  const candEmailResult = buildInvitationEmail({
    candidateName: "Bob Smith",
    assessmentTitle: "Senior Full-Stack Engineer Evaluation",
    testLink: testCandidateLink,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    companyName: "Acme Tech Solutions",
  });
  assert(candEmailResult.subject.includes("Acme Tech Solutions"));
  assert(candEmailResult.text.includes(testCandidateLink));
  assert(candEmailResult.html.includes(testCandidateLink.replace(/&/g, "&amp;")));
  console.log("  ✅ Candidate assessment invitation link correctly embedded:", testCandidateLink);

  // Test 7: Supabase Database Schema Verification
  console.log("\n[TEST 7] Verifying Supabase Company schema customDomain support...");
  const companySample = await prisma.company.findFirst({
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      customDomainVerified: true,
    },
  });
  console.log("  -> Sample company from live database:", companySample);
  assert(companySample !== null);
  assert("customDomain" in companySample);
  assert("customDomainVerified" in companySample);
  console.log("  ✅ Database verified with customDomain and customDomainVerified columns!");

  console.log("\n=================================================================");
  console.log("🎉 ALL 7 SUBDOMAIN & CUSTOM DOMAIN VERIFICATION TESTS PASSED!");
  console.log("=================================================================");
}

runVerification()
  .catch((err) => {
    console.error("❌ Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

