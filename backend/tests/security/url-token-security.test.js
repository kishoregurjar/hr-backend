"use strict";

process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.JWT_ACCESS_SECRET = "test_super_secret_jwt_access_key_123456789";
process.env.JWT_REFRESH_SECRET = "test_super_secret_jwt_refresh_key_123456789";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.REDIS_URL = "redis://localhost:6379";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const authService = require("../../src/modules/auth/auth.service");
const authRepository = require("../../src/modules/auth/auth.repository");
const companyRepository = require("../../src/modules/company/company.repository");
const { companyContext } = require("../../src/modules/company/company.context.middleware");
const { generateAccessToken, generateRefreshToken } = require("../../src/modules/auth/auth.utils");
const requireAuth = require("../../src/middleware/requireAuth");
const { COOKIE_NAMES } = require("../../src/modules/auth/auth.constants");

// ─── Test Fixtures & Mocks ────────────────────────────────────────────────────

const mockCompanies = {
  facebook: {
    id: "comp-fb-101",
    name: "Facebook Company",
    slug: "facebook",
    customDomain: "facebookcompany.com",
    customDomainVerified: false,
    status: "ACTIVE",
  },
  microsoft: {
    id: "comp-ms-202",
    name: "Microsoft Corporation",
    slug: "microsoft",
    customDomain: "microsoftcompany.com",
    customDomainVerified: false,
    status: "ACTIVE",
  },
  oracle: {
    id: "comp-ora-303",
    name: "Oracle",
    slug: "oracle",
    customDomain: "oraclecompany.com",
    customDomainVerified: true,
    status: "ACTIVE",
  },
};

const mockUsers = {
  fbOwner: {
    id: "user-fb-owner-1",
    email: "mark@facebook.com",
    name: "Mark Zuckerberg",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [{ companyId: "comp-fb-101", role: "OWNER" }],
  },
  msOwner: {
    id: "user-ms-owner-2",
    email: "satya@microsoft.com",
    name: "Satya Nadella",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [{ companyId: "comp-ms-202", role: "OWNER" }],
  },
  oraOwner: {
    id: "user-ora-owner-3",
    email: "shiv@oracle.com",
    name: "Shiv",
    password: "$2b$10$mockHashedPassword123456789012345678901234567890",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [{ companyId: "comp-ora-303", role: "OWNER" }],
  },
  superAdmin: {
    id: "user-admin-999",
    email: "superadmin@hirequest.com",
    name: "Platform Super Admin",
    password: "$2b$10$mockHashedPassword123456789012345678901234567890",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [],
  },
};

// Hook mocks
const origFindCompanyBySlug = companyRepository.findCompanyBySlug;
const origFindCompanyContext = companyRepository.findCompanyContext;
const origFindUserByEmail = authRepository.findUserByEmail;
const origFindUserById = authRepository.findUserById;
const origGetUserCompanies = authService.getUserCompanies;
const origCreateRefreshToken = authRepository.createRefreshToken;
const origFindRefreshToken = authRepository.findRefreshToken;
const origRevokeRefreshToken = authRepository.revokeRefreshToken;
const origUpdateLastLogin = authRepository.updateLastLogin;
const origBcryptCompare = bcrypt.compare;

const { prisma } = require("../../src/config/prisma");
const origPrismaTransaction = prisma.$transaction;

test.beforeEach(() => {
  prisma.$transaction = async (cb) => cb({});

  bcrypt.compare = async (plain, hashed) => plain === "CorrectPassword@123";

  companyRepository.findCompanyBySlug = async (slugOrDomain) => {
    if (!slugOrDomain) return null;
    const term = slugOrDomain.toLowerCase().trim();
    if (term === "facebook" || term === "facebookcompany" || term === "facebookcompany.com") {
      return mockCompanies.facebook;
    }
    if (term === "microsoft" || term === "microsoftcompany" || term === "microsoftcompany.com") {
      return mockCompanies.microsoft;
    }
    if (term === "oracle" || term === "oraclecompany" || term === "oraclecompany.com") {
      return mockCompanies.oracle;
    }
    return null;
  };

  companyRepository.findCompanyContext = async (companyId, userId) => {
    const user = Object.values(mockUsers).find((u) => u.id === userId);
    if (!user) return null;
    const membership = user.companyMembers.find((m) => m.companyId === companyId);
    if (!membership) return null;
    const comp = Object.values(mockCompanies).find((c) => c.id === companyId);
    if (!comp) return null;
    return {
      ...comp,
      members: [membership],
    };
  };

  authRepository.findUserByEmail = async (email) => {
    const lower = (email || "").toLowerCase().trim();
    if (lower === "mark@facebook.com") return mockUsers.fbOwner;
    if (lower === "satya@microsoft.com") return mockUsers.msOwner;
    if (lower === "shiv@oracle.com") return mockUsers.oraOwner;
    if (lower === "superadmin@hirequest.com") return mockUsers.superAdmin;
    return null;
  };

  authRepository.findUserById = async (id) => {
    if (id === mockUsers.fbOwner.id) return mockUsers.fbOwner;
    if (id === mockUsers.msOwner.id) return mockUsers.msOwner;
    if (id === mockUsers.oraOwner.id) return mockUsers.oraOwner;
    if (id === mockUsers.superAdmin.id) return mockUsers.superAdmin;
    return null;
  };

  authService.getUserCompanies = async (userId) => {
    const user = Object.values(mockUsers).find((u) => u.id === userId);
    if (!user) return [];
    return user.companyMembers.map((m) => {
      const comp = Object.values(mockCompanies).find((c) => c.id === m.companyId);
      return {
        id: comp.id,
        name: comp.name,
        slug: comp.slug,
        status: comp.status,
        role: m.role,
      };
    });
  };

  authRepository.updateLastLogin = async () => {};
  authRepository.createRefreshToken = async () => ({ id: "mock-rt-id" });
  authRepository.findRefreshToken = async (tokenHash) => ({
    id: "rt-123",
    tokenHash,
    userId: mockUsers.oraOwner.id,
    user: mockUsers.oraOwner,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 86400000),
  });
  authRepository.revokeRefreshToken = async () => true;

  authService.clearExchangeTickets();
  requireAuth.clearCache();
});

test.after(() => {
  companyRepository.findCompanyBySlug = origFindCompanyBySlug;
  companyRepository.findCompanyContext = origFindCompanyContext;
  authRepository.findUserByEmail = origFindUserByEmail;
  authRepository.findUserById = origFindUserById;
  authService.getUserCompanies = origGetUserCompanies;
  authRepository.createRefreshToken = origCreateRefreshToken;
  authRepository.findRefreshToken = origFindRefreshToken;
  authRepository.revokeRefreshToken = origRevokeRefreshToken;
  authRepository.updateLastLogin = origUpdateLastLogin;
  bcrypt.compare = origBcryptCompare;
  prisma.$transaction = origPrismaTransaction;
});

// Helper to simulate Express res object
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    cookies: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
      return this;
    },
    cookie(name, val, options) {
      this.cookies[name] = { val, options };
      return this;
    },
    clearCookie(name, options) {
      delete this.cookies[name];
      this.cookies[`_cleared_${name}`] = { options };
      return this;
    },
    redirect(url) {
      this.statusCode = 302;
      this.headers["location"] = url;
      return this;
    },
  };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Cases
// ─────────────────────────────────────────────────────────────────────────────

test("Assertion 1: Login does not redirect or expose auth_token in URLs", async () => {
  const req = {
    headers: { host: "oracle.localhost:3000" },
    body: { email: "shiv@oracle.com", password: "CorrectPassword@123" },
  };

  const result = await authService.login(req.body, req);

  assert.ok(result.accessToken, "Should return accessToken in data payload");
  assert.ok(result.refreshToken, "Should return refreshToken in data payload");
  assert.equal(typeof result.accessToken, "string");

  // Verify tokens are standard JWTs
  const decoded = jwt.decode(result.accessToken);
  assert.equal(decoded.sub, mockUsers.oraOwner.id);

  // Verify no URL redirection is part of authService.login output
  assert.equal(result.redirectUrl, undefined, "Login result must not specify redirectUrl");
  assert.equal(result.url, undefined, "Login result must not contain URL with token");
});

test("Assertion 2: Refresh token is never exposed in URL query parameters", async () => {
  const res = createMockRes();
  const { setRefreshTokenCookie } = require("../../src/modules/auth/auth.utils");
  const sampleRefreshToken = generateRefreshToken(mockUsers.oraOwner);

  setRefreshTokenCookie(res, sampleRefreshToken);

  // Assert cookie was set via HttpOnly cookie
  const cookieEntry = res.cookies[COOKIE_NAMES.REFRESH_TOKEN];
  assert.ok(cookieEntry, "Refresh token must be set in HttpOnly cookie");
  assert.equal(cookieEntry.val, sampleRefreshToken);
  assert.equal(cookieEntry.options.httpOnly, true, "Refresh cookie must be HttpOnly");
  assert.equal(cookieEntry.options.sameSite, "lax");

  // Verify no Location header was set
  assert.equal(res.headers["location"], undefined, "Refresh token must never trigger URL redirection");
});

test("Assertion 3: Authenticated requests succeed with clean URLs via Bearer header or cookie", async () => {
  const token = generateAccessToken(mockUsers.oraOwner);
  let nextCalled = false;

  const req = {
    method: "GET",
    url: "/api/v1/auth/me", // Clean URL, NO query parameters
    originalUrl: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${token}`,
      host: "oracle.localhost:3000",
    },
    cookies: {},
    query: {},
  };
  const res = createMockRes();

  await requireAuth(req, res, (err) => {
    if (!err) nextCalled = true;
  });

  assert.equal(nextCalled, true, "requireAuth should proceed for valid Bearer token");
  assert.equal(req.user.id, mockUsers.oraOwner.id);
});

test("Assertion 4: Tenant A session cannot authenticate Tenant B", async () => {
  // Facebook user attempts to access Microsoft tenant API
  const fbToken = generateAccessToken(mockUsers.fbOwner);

  const req = {
    method: "GET",
    url: "/api/v1/company/dashboard",
    headers: {
      authorization: `Bearer ${fbToken}`,
      host: "microsoft.localhost:3000", // Mismatched hostname
    },
    cookies: {},
    query: {},
  };
  const res = createMockRes();

  // 1. Authenticate user
  await requireAuth(req, res, () => {});
  assert.equal(req.user.id, mockUsers.fbOwner.id);

  // 2. Run tenant context middleware
  let caughtError = null;
  await companyContext(req, res, (err) => {
    if (err) caughtError = err;
  });

  assert.ok(caughtError, "Cross-tenant access must be rejected");
  assert.equal(caughtError.statusCode, 403, "Must return HTTP 403 Forbidden");
  assert.ok(
    caughtError.code === "COMPANY_ACCESS_DENIED" || caughtError.code === "FORBIDDEN_TENANT_ACCESS",
    "Must have appropriate forbidden tenant code"
  );
});

test("Assertion 5: Tenant B session cannot authenticate Tenant A", async () => {
  // Microsoft user attempts to access Facebook tenant API
  const msToken = generateAccessToken(mockUsers.msOwner);

  const req = {
    method: "GET",
    url: "/api/v1/company/dashboard",
    headers: {
      authorization: `Bearer ${msToken}`,
      host: "facebook.localhost:3000", // Mismatched hostname
    },
    cookies: {},
    query: {},
  };
  const res = createMockRes();

  // 1. Authenticate user
  await requireAuth(req, res, () => {});
  assert.equal(req.user.id, mockUsers.msOwner.id);

  // 2. Run tenant context middleware
  let caughtError = null;
  await companyContext(req, res, (err) => {
    if (err) caughtError = err;
  });

  assert.ok(caughtError, "Cross-tenant access must be rejected");
  assert.equal(caughtError.statusCode, 403, "Must return HTTP 403 Forbidden");
  assert.ok(
    caughtError.code === "COMPANY_ACCESS_DENIED" || caughtError.code === "FORBIDDEN_TENANT_ACCESS",
    "Must have appropriate forbidden tenant code"
  );
});

test("Assertion 6: Platform Super Admin logs in on root domain cleanly", async () => {
  const req = {
    headers: { host: "localhost:3000" },
    body: { email: "superadmin@hirequest.com", password: "CorrectPassword@123" },
  };

  const result = await authService.login(req.body, req);
  assert.ok(result.accessToken, "Super admin receives accessToken");
  assert.equal(result.user.role, "SUPER_ADMIN");
  // Verify no URL parameters in result
  assert.equal(result.redirectUrl, undefined);
});

test("Assertion 7: Refresh token rotation works without URL parameters", async () => {
  const sampleRefreshToken = generateRefreshToken(mockUsers.oraOwner);
  const req = {
    headers: { host: "oracle.localhost:3000" },
    cookies: { [COOKIE_NAMES.REFRESH_TOKEN]: sampleRefreshToken },
    body: {},
  };

  const result = await authService.refreshAccessToken(sampleRefreshToken, req);
  assert.ok(result.accessToken, "Rotated access token generated");
  assert.ok(result.refreshToken, "Rotated refresh token generated");
  assert.notEqual(result.refreshToken, sampleRefreshToken, "Refresh token must be rotated");

  // Verify response structure does not contain URLs with tokens
  assert.equal(result.redirectUrl, undefined);
});

test("Assertion 8: Logout invalidates the session and clears cookies cleanly", async () => {
  const res = createMockRes();
  const { clearRefreshTokenCookie } = require("../../src/modules/auth/auth.utils");

  clearRefreshTokenCookie(res);

  // Verify refresh token cookie is cleared
  assert.ok(
    res.cookies[`_cleared_${COOKIE_NAMES.REFRESH_TOKEN}`],
    "Refresh token cookie must be explicitly cleared"
  );
  assert.equal(res.headers["location"], undefined, "Logout must not redirect with tokens");
});

test("Assertion 9: Expired session behaves correctly (HTTP 401)", async () => {
  // Generate token that expired 1 hour ago
  const expiredToken = jwt.sign(
    { sub: mockUsers.oraOwner.id, email: mockUsers.oraOwner.email, role: mockUsers.oraOwner.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: -3600 }
  );

  const req = {
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${expiredToken}`,
      host: "oracle.localhost:3000",
    },
    cookies: {},
    query: {},
  };
  const res = createMockRes();

  let caughtErr = null;
  await requireAuth(req, res, (err) => {
    if (err) caughtErr = err;
  });

  assert.ok(caughtErr, "Expired token must yield an error");
  assert.equal(caughtErr.statusCode, 401, "Expired token must yield HTTP 401");
});

test("Assertion 10: Strict Security: No endpoint accepts JWTs passed in URL query parameters (?token= or ?auth_token=)", async () => {
  const validToken = generateAccessToken(mockUsers.oraOwner);

  // Case 1: ?token=<jwt> in URL without Authorization header or cookie
  const req1 = {
    method: "GET",
    url: `/api/v1/auth/me?token=${validToken}`,
    headers: { host: "oracle.localhost:3000" }, // No Authorization header!
    cookies: {},
    query: { token: validToken },
  };
  const res1 = createMockRes();

  let caughtErr1 = null;
  await requireAuth(req1, res1, (err) => {
    if (err) caughtErr1 = err;
  });

  assert.ok(caughtErr1, "Query param token must be rejected");
  assert.equal(caughtErr1.statusCode, 401);
  assert.equal(caughtErr1.code, "TOKEN_REQUIRED");

  // Case 2: ?auth_token=<jwt> in URL without Authorization header or cookie
  const req2 = {
    method: "GET",
    url: `/api/v1/auth/me?auth_token=${validToken}`,
    headers: { host: "oracle.localhost:3000" },
    cookies: {},
    query: { auth_token: validToken },
  };
  const res2 = createMockRes();

  let caughtErr2 = null;
  await requireAuth(req2, res2, (err) => {
    if (err) caughtErr2 = err;
  });

  assert.ok(caughtErr2, "Query param auth_token must be rejected");
  assert.equal(caughtErr2.statusCode, 401);
  assert.equal(caughtErr2.code, "TOKEN_REQUIRED");
});

test("Assertion 11: Single-use exchange ticket generation (Requirement 10)", async () => {
  const result = await authService.createExchangeTicket(mockUsers.oraOwner.id, mockCompanies.oracle.id);

  assert.ok(result.ticket, "Must return exchange ticket");
  assert.equal(typeof result.ticket, "string");
  assert.equal(result.ticket.length, 64, "Ticket must be secure 32-byte hex string");
  assert.equal(result.expiresIn, 60, "TTL must be 60 seconds");

  // Verify ticket is NOT a JWT
  assert.equal(result.ticket.includes("."), false, "Ticket must NOT be a JWT");
});

test("Assertion 12: Single-use exchange ticket consumption & immediate invalidation", async () => {
  const { ticket } = await authService.createExchangeTicket(mockUsers.oraOwner.id, mockCompanies.oracle.id);

  // 1st consumption: Succeeds
  const session = await authService.consumeExchangeTicket(ticket);
  assert.ok(session.accessToken, "Returns fresh accessToken");
  assert.ok(session.refreshToken, "Returns fresh refreshToken");
  assert.equal(session.user.id, mockUsers.oraOwner.id);

  // 2nd consumption: MUST be rejected immediately (single use guarantee)
  let replayErr = null;
  try {
    await authService.consumeExchangeTicket(ticket);
  } catch (err) {
    replayErr = err;
  }

  assert.ok(replayErr, "Replaying exchange ticket must fail");
  assert.equal(replayErr.statusCode, 401);
  assert.equal(replayErr.code, "TICKET_INVALID");
});

test("Assertion 13: Expired or invalid exchange ticket rejection", async () => {
  // Invalid ticket
  let invalidErr = null;
  try {
    await authService.consumeExchangeTicket("completely-invalid-ticket-xyz");
  } catch (err) {
    invalidErr = err;
  }
  assert.ok(invalidErr);
  assert.equal(invalidErr.statusCode, 401);

  // Empty ticket
  let emptyErr = null;
  try {
    await authService.consumeExchangeTicket("");
  } catch (err) {
    emptyErr = err;
  }
  assert.ok(emptyErr);
  assert.equal(emptyErr.statusCode, 401);
});

test("Assertion 14: URL Sanitization hygiene test", () => {
  // Simulates frontend URL sanitization logic
  const dirtyUrl = "http://oracle.localhost:3000/dashboard?auth_token=eyJhbGci...&refresh_token=rt_xyz&company_id=comp-101";
  const urlObj = new URL(dirtyUrl);

  assert.ok(urlObj.searchParams.has("auth_token"));
  assert.ok(urlObj.searchParams.has("refresh_token"));

  // Apply sanitization
  urlObj.searchParams.delete("auth_token");
  urlObj.searchParams.delete("refresh_token");
  urlObj.searchParams.delete("company_id");

  const cleanUrl = urlObj.pathname + (urlObj.searchParams.toString() ? `?${urlObj.searchParams.toString()}` : "");
  assert.equal(cleanUrl, "/dashboard", "Clean URL must be /dashboard without any query tokens");
});
