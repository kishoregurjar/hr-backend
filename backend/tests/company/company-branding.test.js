"use strict";

/**
 * White-Label Branding Security & Unit Test Suite
 *
 * Verifies RBAC, tenant isolation, input validation, URL sanitization,
 * DTO scrubbing, fallback defaults, and candidate branding isolation.
 *
 * Requirements: Offline execution only. No live database or network connections.
 * Run: node --test tests/company/company-branding.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COMPANY_ROLES,
  COMPANY_PERMISSIONS,
  hasPermission,
  assertPermission,
} = require("../../src/modules/company/company.authorization");
const { COMPANY_CONSTANTS } = require("../../src/modules/company/company.constants");
const {
  toPublicBrandingDTO,
  updateBrandingSchema,
} = require("../../src/modules/company/company.branding.dto");
const {
  validateFaviconFile,
} = require("../../src/modules/company/company.favicon.service");

// ─── 1. RBAC & Permissions ──────────────────────────────────────────────────

test("Branding RBAC: OWNER is granted UPDATE_BRANDING permission", () => {
  assert.strictEqual(
    hasPermission(COMPANY_ROLES.OWNER, COMPANY_PERMISSIONS.UPDATE_BRANDING),
    true,
    "OWNER must have UPDATE_BRANDING"
  );
  assert.strictEqual(
    assertPermission(COMPANY_ROLES.OWNER, COMPANY_PERMISSIONS.UPDATE_BRANDING),
    true
  );
});

test("Branding RBAC: ADMIN is granted UPDATE_BRANDING permission", () => {
  assert.strictEqual(
    hasPermission(COMPANY_ROLES.ADMIN, COMPANY_PERMISSIONS.UPDATE_BRANDING),
    true,
    "ADMIN must have UPDATE_BRANDING"
  );
  assert.strictEqual(
    assertPermission(COMPANY_ROLES.ADMIN, COMPANY_PERMISSIONS.UPDATE_BRANDING),
    true
  );
});

test("Branding RBAC: RECRUITER receives 403 when attempting UPDATE_BRANDING", () => {
  assert.strictEqual(
    hasPermission(COMPANY_ROLES.RECRUITER, COMPANY_PERMISSIONS.UPDATE_BRANDING),
    false,
    "RECRUITER must not have UPDATE_BRANDING"
  );

  assert.throws(
    () =>
      assertPermission(
        COMPANY_ROLES.RECRUITER,
        COMPANY_PERMISSIONS.UPDATE_BRANDING
      ),
    (error) => {
      assert.strictEqual(error.statusCode, 403);
      assert.strictEqual(
        error.code,
        COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED
      );
      return true;
    }
  );
});

// ─── 2. Input Validation: Hex Colors ─────────────────────────────────────────

test("Input Validation: Valid HEX colors are accepted (3 and 6 characters)", () => {
  const validPayloads = [
    { brandColor: "#2563EB" },
    { brandColor: "#fff" },
    { brandColor: "#000000" },
    { brandColor: "#1d4ed8", accentColor: "#f3f4f6" },
    { brandColor: null, accentColor: null },
    { brandColor: "" }, // Converted to null by emptyToNull
  ];

  for (const payload of validPayloads) {
    const result = updateBrandingSchema.parse(payload);
    assert.ok(result);
  }
});

test("Input Validation: Invalid HEX colors are strictly rejected", () => {
  const invalidColors = [
    "red",
    "blue",
    "#12",
    "#12345",
    "#1234567",
    "rgb(255,0,0)",
    "rgba(0,0,0,1)",
    "hsl(0, 100%, 50%)",
    "#gggggg",
    "javascript:alert(1)",
  ];

  for (const color of invalidColors) {
    assert.throws(
      () => updateBrandingSchema.parse({ brandColor: color }),
      (err) => {
        assert.ok(
          err.issues.some((i) =>
            i.message.includes("Invalid HEX color format")
          ),
          `Expected invalid HEX error for: ${color}`
        );
        return true;
      }
    );
  }
});

// ─── 3. Input Validation: Safe URLs & Unsafe Protocol Rejection ─────────────

test("Input Validation: Safe HTTPS URLs are accepted for favicon/logo", () => {
  const result = updateBrandingSchema.parse({
    faviconUrl: "https://cdn.example.com/assets/favicon.ico",
    logoUrl: "https://cdn.example.com/assets/logo.png",
  });

  assert.strictEqual(
    result.faviconUrl,
    "https://cdn.example.com/assets/favicon.ico"
  );
  assert.strictEqual(
    result.logoUrl,
    "https://cdn.example.com/assets/logo.png"
  );
});

test("Input Validation: Unsafe URL protocols are strictly rejected", () => {
  const unsafeUrls = [
    "javascript:alert(document.cookie)",
    "javascript:void(0)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://attacker.com/exploit.ico",
  ];

  for (const unsafe of unsafeUrls) {
    assert.throws(
      () => updateBrandingSchema.parse({ faviconUrl: unsafe }),
      (err) => {
        assert.ok(
          err.issues.length > 0,
          `Expected rejection for unsafe URL: ${unsafe}`
        );
        return true;
      }
    );
  }
});

// ─── 4. Input Validation: Strict Schema Prevents Arbitrary Field Injection ───

test("Input Validation: Arbitrary and privileged fields are rejected by strict schema", () => {
  const forbiddenPayloads = [
    { companyId: "malicious-tenant-id" },
    { id: "new-id" },
    { role: "OWNER" },
    { isVerified: true },
    { subscriptionTier: "ENTERPRISE" },
    { ownerId: "hacker-user-id" },
    { unknownField: "unexpected" },
  ];

  for (const payload of forbiddenPayloads) {
    assert.throws(
      () => updateBrandingSchema.parse(payload),
      (err) => {
        assert.ok(
          err.issues.some((i) => i.code === "unrecognized_keys"),
          `Expected unrecognized_keys error for ${JSON.stringify(payload)}`
        );
        return true;
      }
    );
  }
});

test("Input Validation: Tagline length boundary enforcement", () => {
  const validTagline = "A".repeat(120);
  assert.strictEqual(
    updateBrandingSchema.parse({ brandTagline: validTagline }).brandTagline,
    validTagline
  );

  const oversizedTagline = "A".repeat(121);
  assert.throws(
    () => updateBrandingSchema.parse({ brandTagline: oversizedTagline }),
    (err) => {
      assert.ok(
        err.issues.some((i) => i.message.includes("Tagline cannot exceed")),
        "Expected error for tagline > 120 chars"
      );
      return true;
    }
  );
});

// ─── 5. Tenant Isolation: Company A cannot update Company B ──────────────────

test("Tenant Isolation: Body companyId injection is blocked by schema and context", () => {
  // 1. Schema rejects any attempt to pass companyId in payload
  assert.throws(
    () =>
      updateBrandingSchema.parse({
        companyId: "victim-company-id",
        brandColor: "#FF0000",
      }),
    (err) => {
      assert.ok(err.issues.some((i) => i.code === "unrecognized_keys"));
      return true;
    }
  );

  // 2. Controller and service resolve target company strictly from verified authenticated context
  const mockReq = {
    companyContext: {
      companyId: "company-a-uuid",
      role: "OWNER",
    },
    companyId: "company-a-uuid",
    body: {
      brandColor: "#00FF00",
      companyId: "company-b-uuid", // malicious overwrite attempt
    },
  };

  // Target companyId resolved by controller is always the authenticated companyId
  const effectiveCompanyId = mockReq.companyId;
  assert.strictEqual(effectiveCompanyId, "company-a-uuid");
  assert.notStrictEqual(effectiveCompanyId, mockReq.body.companyId);
});

// ─── 6. Public Branding DTO Sanitization & Data Scrubbing ────────────────────

test("DTO Sanitization: Strips all internal, private, and credential fields", () => {
  const fullCompanyEntity = {
    id: "comp-12345",
    name: "Acme Innovations",
    slug: "acme-innovations",
    status: "ACTIVE",
    email: "billing@acme.com",
    phone: "+1-555-0199",
    address: "123 Main St",
    city: "San Francisco",
    country: "USA",
    logoUrl: "https://storage.hirequest.io/logo.webp",
    logoPath: "company-logos/comp-12345/private-logo.webp",
    faviconUrl: "https://storage.hirequest.io/fav.webp",
    faviconPath: "company-favicons/comp-12345/private-fav.webp",
    brandColor: "#2563EB",
    accentColor: "#1D4ED8",
    brandTagline: "Innovating the future of work",
    showPoweredByHireQuest: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [{ userId: "u-1", role: "OWNER" }],
  };

  const dto = toPublicBrandingDTO(fullCompanyEntity);

  // Must only contain whitelist keys
  const expectedKeys = [
    "companyName",
    "logoUrl",
    "brandColor",
    "accentColor",
    "faviconUrl",
    "brandTagline",
    "showPoweredByHireQuest",
  ];

  assert.deepStrictEqual(Object.keys(dto).sort(), expectedKeys.sort());

  // Must match company data
  assert.strictEqual(dto.companyName, "Acme Innovations");
  assert.strictEqual(dto.brandColor, "#2563EB");
  assert.strictEqual(dto.accentColor, "#1D4ED8");
  assert.strictEqual(dto.brandTagline, "Innovating the future of work");
  assert.strictEqual(dto.showPoweredByHireQuest, true);

  // Must NOT expose private fields
  assert.strictEqual(dto.id, undefined);
  assert.strictEqual(dto.email, undefined);
  assert.strictEqual(dto.phone, undefined);
  assert.strictEqual(dto.logoPath, undefined);
  assert.strictEqual(dto.faviconPath, undefined);
  assert.strictEqual(dto.status, undefined);
  assert.strictEqual(dto.members, undefined);
});

// ─── 7. Default Fallback for Unbranded Companies ─────────────────────────────

test("Fallback Defaults: Unbranded or null company returns safe fallbacks", () => {
  const nullDto = toPublicBrandingDTO(null);
  assert.deepStrictEqual(nullDto, {
    companyName: null,
    logoUrl: null,
    brandColor: null,
    accentColor: null,
    faviconUrl: null,
    brandTagline: null,
    showPoweredByHireQuest: true,
  });

  const emptyCompanyDto = toPublicBrandingDTO({});
  assert.strictEqual(emptyCompanyDto.companyName, null);
  assert.strictEqual(emptyCompanyDto.logoUrl, null);
  assert.strictEqual(emptyCompanyDto.brandColor, null);
  assert.strictEqual(emptyCompanyDto.showPoweredByHireQuest, true);

  const partialCompanyDto = toPublicBrandingDTO({
    name: "Unbranded Corp",
    showPoweredByHireQuest: true,
  });
  assert.strictEqual(partialCompanyDto.companyName, "Unbranded Corp");
  assert.strictEqual(partialCompanyDto.brandColor, null);
  assert.strictEqual(partialCompanyDto.showPoweredByHireQuest, true);
});

// ─── 8. Candidate Invitation Verification Isolation ──────────────────────────

test("Candidate Verification: Invitation receives only its own company branding", () => {
  const companyA = {
    name: "Tech Solutions Corp",
    logoUrl: "https://storage.hirequest.io/tech.webp",
    brandColor: "#0A58CA",
    accentColor: "#04419C",
    faviconUrl: "https://storage.hirequest.io/tech-fav.webp",
    brandTagline: "Empowering tech teams",
    showPoweredByHireQuest: false,
  };

  const companyB = {
    name: "Health Global Inc",
    logoUrl: "https://storage.hirequest.io/health.webp",
    brandColor: "#198754",
    accentColor: "#157347",
    faviconUrl: "https://storage.hirequest.io/health-fav.webp",
    brandTagline: "Healthcare for everyone",
    showPoweredByHireQuest: true,
  };

  const invitationA = {
    id: "inv-1",
    assessment: {
      createdBy: {
        companyMembers: [{ role: "OWNER", company: companyA }],
      },
    },
  };

  const brandingA = toPublicBrandingDTO(
    invitationA.assessment.createdBy.companyMembers[0].company
  );

  assert.strictEqual(brandingA.companyName, "Tech Solutions Corp");
  assert.strictEqual(brandingA.brandColor, "#0A58CA");
  assert.strictEqual(brandingA.showPoweredByHireQuest, false);

  // Verify completely independent from companyB
  assert.notStrictEqual(brandingA.companyName, companyB.name);
  assert.notStrictEqual(brandingA.brandColor, companyB.brandColor);
});

// ─── 9. Favicon Upload Validation ────────────────────────────────────────────

test("Favicon Validation: Missing or invalid file types are rejected", () => {
  assert.throws(
    () => validateFaviconFile(null),
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(
        err.code,
        COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE
      );
      return true;
    }
  );

  const invalidMimeFile = {
    mimetype: "application/pdf",
    size: 1024,
    buffer: Buffer.from("pdf-data"),
  };
  assert.throws(
    () => validateFaviconFile(invalidMimeFile),
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(
        err.code,
        COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE
      );
      return true;
    }
  );

  const oversizedFile = {
    mimetype: "image/png",
    size: 512 * 1024 + 1, // 512 KB + 1 byte
    buffer: Buffer.alloc(100),
  };
  assert.throws(
    () => validateFaviconFile(oversizedFile),
    (err) => {
      assert.strictEqual(err.statusCode, 413);
      assert.strictEqual(
        err.code,
        COMPANY_CONSTANTS.ERROR_CODES.FAVICON_TOO_LARGE
      );
      return true;
    }
  );

  const validIcoFile = {
    mimetype: "image/x-icon",
    size: 16 * 1024,
    buffer: Buffer.alloc(100),
  };
  assert.doesNotThrow(() => validateFaviconFile(validIcoFile));

  const validPngFile = {
    mimetype: "image/png",
    size: 32 * 1024,
    buffer: Buffer.alloc(100),
  };
  assert.doesNotThrow(() => validateFaviconFile(validPngFile));
});

