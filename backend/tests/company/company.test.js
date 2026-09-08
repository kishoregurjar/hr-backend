"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPANY_CONSTANTS,
} = require("../../src/modules/company/company.constants");
const {
  assertPermission,
  COMPANY_PERMISSIONS,
} = require("../../src/modules/company/company.authorization");
const {
  mapCompany,
} = require("../../src/modules/company/company.mapper");

test("Company Module Unit Suite", async (t) => {
  await t.test("company.constants has correct defaults", () => {
    assert.equal(COMPANY_CONSTANTS.LOGO.MAX_SIZE_BYTES, 2097152);
    assert.equal(
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      "COMPANY_NOT_FOUND"
    );
  });

  await t.test("company.authorization enforces permissions correctly", () => {
    assert.equal(
      assertPermission("OWNER", COMPANY_PERMISSIONS.DELETE_COMPANY),
      true
    );
    assert.throws(
      () => assertPermission("RECRUITER", COMPANY_PERMISSIONS.DELETE_COMPANY),
      {
        statusCode: 403,
      }
    );
  });

  await t.test("company.mapper serializes objects cleanly", () => {
    const raw = {
      id: "comp-1",
      name: "Test Corp",
      slug: "test-corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mapped = mapCompany(raw);
    assert.equal(mapped.id, "comp-1");
    assert.equal(mapped.slug, "test-corp");
  });
});
