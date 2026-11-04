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

const authService = require("../../src/modules/auth/auth.service");
const authRepository = require("../../src/modules/auth/auth.repository");
const companyRepository = require("../../src/modules/company/company.repository");
const companyContextModule = require("../../src/modules/company/company.context");
const { companyContext } = require("../../src/modules/company/company.context.middleware");
const { resolveTenantFromRequest } = require("../../src/modules/company/company.tenant-resolver");
const { generateAccessToken, generateRefreshToken } = require("../../src/modules/auth/auth.utils");
const requireAuth = require("../../src/middleware/requireAuth");

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
  suspended: {
    id: "comp-susp-303",
    name: "Suspended Corp",
    slug: "suspended-corp",
    customDomain: null,
    customDomainVerified: false,
    status: "SUSPENDED",
  },
};

const mockUsers = {
  fbUser: {
    id: "user-fb-1",
    email: "mark@facebook.com",
    password: "$2b$10$mockHashedPassword123456789012345678901234567890",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [{ companyId: "comp-fb-101", role: "OWNER" }],
  },
  msUser: {
    id: "user-ms-2",
    email: "satya@microsoft.com",
    password: "$2b$10$mockHashedPassword123456789012345678901234567890",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [{ companyId: "comp-ms-202", role: "OWNER" }],
  },
  dualUser: {
    id: "user-dual-3",
    email: "consultant@tech.com",
    password: "$2b$10$mockHashedPassword123456789012345678901234567890",
    role: "HR",
    status: "ACTIVE",
    tokenVersion: 0,
    companyMembers: [
      { companyId: "comp-fb-101", role: "ADMIN" },
      { companyId: "comp-ms-202", role: "RECRUITER" },
    ],
  },
  superAdminUser: {
    id: "user-admin-999",
    email: "superadmin@hirequest.com",
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
const origComparePassword = require("../../src/modules/auth/auth.utils").comparePassword;

const { prisma } = require("../../src/config/prisma");
const origPrismaTransaction = prisma.$transaction;

test.beforeEach(() => {
  prisma.$transaction = async (cb) => cb({});
  // Mock companyRepository.findCompanyBySlug
  companyRepository.findCompanyBySlug = async (slugOrDomain) => {
    if (!slugOrDomain) return null;
    const term = slugOrDomain.toLowerCase().trim();
    if (term === "facebook" || term === "facebookcompany" || term === "facebookcompany.com") {
      return mockCompanies.facebook;
    }
    if (term === "microsoft" || term === "microsoftcompany" || term === "microsoftcompany.com") {
      return mockCompanies.microsoft;
    }
    if (term === "suspended" || term === "suspended-corp") {
      return mockCompanies.suspended;
    }
    return null;
  };

  // Mock companyRepository.findCompanyContext
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

  // Mock authRepository.findUserByEmail
  authRepository.findUserByEmail = async (email) => {
    const user = Object.values(mockUsers).find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  };

  // Mock authRepository.findUserById
  authRepository.findUserById = async (id) => {
    const user = Object.values(mockUsers).find((u) => u.id === id);
    return user || null;
  };

  // Mock authService.getUserCompanies
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

  // Mock authRepository.updateLastLogin & createRefreshToken
  authRepository.updateLastLogin = async () => {};
  authRepository.createRefreshToken = async () => {};
});

test.after(() => {
  prisma.$transaction = origPrismaTransaction;
  companyRepository.findCompanyBySlug = origFindCompanyBySlug;
  companyRepository.findCompanyContext = origFindCompanyContext;
  authRepository.findUserByEmail = origFindUserByEmail;
  authRepository.findUserById = origFindUserById;
  authService.getUserCompanies = origGetUserCompanies;
});

// Helper for bcrypt password comparison in tests
const bcrypt = require("bcrypt");
const origBcryptCompare = bcrypt.compare;
bcrypt.compare = async (plain, hashed) => plain === "CorrectPassword@123";

// ─── Scenario 1: Facebook user logs in on Facebook hostname — allowed ─────────
test("Scenario 1: Facebook user logs in on Facebook hostname — allowed", async () => {
  const req = {
    headers: {
      host: "facebook.localhost:3000",
      origin: "http://facebook.localhost:3000",
    },
  };

  const result = await authService.login(
    { email: "mark@facebook.com", password: "CorrectPassword@123" },
    req
  );

  assert.equal(result.message, "Login successful.");
  assert.equal(result.user.email, "mark@facebook.com");
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].id, "comp-fb-101");

  // Verify access token is bound to Facebook company
  const decoded = jwt.decode(result.accessToken);
  assert.equal(decoded.companyId, "comp-fb-101");
});

// ─── Scenario 2: Microsoft user logs in on Microsoft hostname — allowed ───────
test("Scenario 2: Microsoft user logs in on Microsoft hostname — allowed", async () => {
  const req = {
    headers: {
      host: "microsoft.localhost:3000",
      origin: "http://microsoft.localhost:3000",
    },
  };

  const result = await authService.login(
    { email: "satya@microsoft.com", password: "CorrectPassword@123" },
    req
  );

  assert.equal(result.message, "Login successful.");
  assert.equal(result.user.email, "satya@microsoft.com");
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].id, "comp-ms-202");

  const decoded = jwt.decode(result.accessToken);
  assert.equal(decoded.companyId, "comp-ms-202");
});

// ─── Scenario 3: Facebook user attempts login on Microsoft hostname — HTTP 403 ─
test("Scenario 3: Facebook user attempts login on Microsoft hostname — HTTP 403", async () => {
  const req = {
    headers: {
      host: "microsoft.localhost:3000",
      origin: "http://microsoft.localhost:3000",
    },
  };

  await assert.rejects(
    async () => {
      await authService.login(
        { email: "mark@facebook.com", password: "CorrectPassword@123" },
        req
      );
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "TENANT_ACCESS_DENIED");
      return true;
    }
  );
});

// ─── Scenario 4: Microsoft user attempts login on Facebook hostname — HTTP 403 ─
test("Scenario 4: Microsoft user attempts login on Facebook hostname — HTTP 403", async () => {
  const req = {
    headers: {
      host: "facebook.localhost:3000",
      origin: "http://facebook.localhost:3000",
    },
  };

  await assert.rejects(
    async () => {
      await authService.login(
        { email: "satya@microsoft.com", password: "CorrectPassword@123" },
        req
      );
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "TENANT_ACCESS_DENIED");
      return true;
    }
  );
});

// ─── Scenario 5: Dual-membership user on Facebook hostname — restricted context ─
test("Scenario 5: User belonging to both companies logs in on Facebook hostname — Facebook context only", async () => {
  const req = {
    headers: {
      host: "facebook.localhost:3000",
      origin: "http://facebook.localhost:3000",
    },
  };

  const result = await authService.login(
    { email: "consultant@tech.com", password: "CorrectPassword@123" },
    req
  );

  assert.equal(result.message, "Login successful.");
  // Must return strictly 1 company (Facebook), never leaking or switching to Microsoft
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0].id, "comp-fb-101");
  assert.equal(result.companies[0].name, "Facebook Company");

  const decoded = jwt.decode(result.accessToken);
  assert.equal(decoded.companyId, "comp-fb-101");
});

// ─── Scenario 6: User attempts to change X-Company-Id to another company — HTTP 403
test("Scenario 6: User attempts to change X-Company-Id to another company — HTTP 403", async () => {
  const req = {
    headers: {
      host: "facebook.localhost:3000",
      origin: "http://facebook.localhost:3000",
      "x-company-id": "comp-ms-202", // Malicious header injection: claiming Microsoft on Facebook domain
    },
    user: mockUsers.dualUser, // User has legitimate access to Microsoft in DB, but cannot access it via Facebook host
  };

  const res = {};
  await companyContext(req, res, (err) => {
    assert.ok(err, "Expected companyContext to reject mismatched X-Company-Id");
    assert.equal(err.statusCode, 403);
    assert.equal(err.code, "TENANT_MISMATCH");
  });
});

// ─── Scenario 7: User changes X-Tenant-Identifier header — cannot bypass server validation
test("Scenario 7: User changes X-Tenant-Identifier to another tenant — cannot bypass server-side validation", async () => {
  const req = {
    headers: {
      origin: "http://facebook.localhost:3000",
      referer: "http://facebook.localhost:3000/dashboard",
      "x-tenant-identifier": "microsoft", // Attempt to spoof tenant identifier header
    },
  };

  const resolved = await resolveTenantFromRequest(req);
  // Authoritative host origin takes absolute precedence
  assert.equal(resolved.id, "comp-fb-101");
  assert.equal(resolved.slug, "facebook");
});

// ─── Scenario 8: Missing tenant context on protected tenant API — rejected (HTTP 400)
test("Scenario 8: Missing tenant context on a protected tenant API — rejected (HTTP 400)", async () => {
  const req = {
    headers: {
      host: "localhost:3000", // Root platform domain
    },
    user: {
      id: "orphan-user",
      role: "HR",
      companyMembers: [], // No company membership
    },
  };

  const res = {};
  await companyContext(req, res, (err) => {
    assert.ok(err, "Expected COMPANY_CONTEXT_REQUIRED error");
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, "COMPANY_CONTEXT_REQUIRED");
  });
});

// ─── Scenario 9: Unknown hostname/tenant — rejected safely (HTTP 404) ───────────
test("Scenario 9: Unknown hostname/tenant — rejected safely (HTTP 404)", async () => {
  const req = {
    headers: {
      host: "nonexistent-corp.localhost:3000",
    },
  };

  await assert.rejects(
    async () => {
      await resolveTenantFromRequest(req);
    },
    (err) => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, "TENANT_NOT_FOUND");
      return true;
    }
  );
});

// ─── Scenario 10: Platform Super Admin login on root hostname — preserved ──────
test("Scenario 10: Platform Super Admin login on root hostname — existing behavior preserved", async () => {
  const req = {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  };

  const result = await authService.login(
    { email: "superadmin@hirequest.com", password: "CorrectPassword@123" },
    req
  );

  assert.equal(result.message, "Login successful.");
  assert.equal(result.user.role, "SUPER_ADMIN");
});

// ─── Scenario 11: Platform-level APIs continue to work without company context ─
test("Scenario 11: Platform-level APIs work without unnecessary company context", async () => {
  const adminToken = generateAccessToken(mockUsers.superAdminUser);

  const req = {
    headers: {
      authorization: `Bearer ${adminToken}`,
      host: "localhost:3000",
    },
  };
  const res = {};

  // requireAuth must succeed for Super Admin without requiring any companyContext middleware
  await requireAuth(req, res, (err) => {
    assert.ifError(err);
    assert.equal(req.user.role, "SUPER_ADMIN");
  });
});

// ─── Scenario 12: Expired or invalid tokens cannot bypass tenant validation ─────
test("Scenario 12: Expired or invalid tokens cannot bypass tenant validation", async () => {
  // 1. Expired token
  const expiredToken = jwt.sign(
    {
      sub: "user-fb-1",
      email: "mark@facebook.com",
      role: "HR",
      type: "access",
      companyId: "comp-fb-101",
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "-1s", // Expired
      issuer: "HireQuest",
      audience: "HireQuest",
    }
  );

  const expiredReq = {
    headers: {
      authorization: `Bearer ${expiredToken}`,
      host: "facebook.localhost:3000",
    },
  };

  await requireAuth(expiredReq, {}, (err) => {
    assert.ok(err);
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "TOKEN_EXPIRED");
  });

  // 2. Token with forged signature
  const forgedToken = jwt.sign(
    { sub: "user-fb-1", role: "HR", type: "access" },
    "wrong_signature_secret_1234567890",
    { expiresIn: "15m", issuer: "HireQuest", audience: "HireQuest" }
  );

  const forgedReq = {
    headers: {
      authorization: `Bearer ${forgedToken}`,
      host: "facebook.localhost:3000",
    },
  };

  await requireAuth(forgedReq, {}, (err) => {
    assert.ok(err);
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "INVALID_TOKEN");
  });

  // 3. Raw token passed in URL query param is rejected
  const queryParamReq = {
    headers: {
      host: "facebook.localhost:3000",
    },
    query: {
      token: "secret_access_token_in_url",
    },
  };

  await requireAuth(queryParamReq, {}, (err) => {
    assert.ok(err);
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, "TOKEN_REQUIRED");
  });
});

// ─── Bonus Scenario 13: Simulated Custom Domain Tenant Login ───────────────────
test("Scenario 13: Custom domain simulated hostname resolves and allows legitimate owner", async () => {
  const req = {
    headers: {
      host: "facebookcompany.localhost:3000",
      origin: "http://facebookcompany.localhost:3000",
    },
  };

  const result = await authService.login(
    { email: "mark@facebook.com", password: "CorrectPassword@123" },
    req
  );

  assert.equal(result.message, "Login successful.");
  assert.equal(result.companies[0].id, "comp-fb-101");
  assert.equal(result.companies[0].name, "Facebook Company");
});
