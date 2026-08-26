"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { handlePrismaError } = require("../../src/utils/prisma-error");
const { AppError } = require("../../src/utils/app-error");

describe("Prisma Error Mapping Utility Suite", () => {
  it("should return null for non-prisma errors or missing error code", () => {
    assert.equal(handlePrismaError(null), null);
    assert.equal(handlePrismaError(new Error("Generic error")), null);
  });

  it("should map P2002 duplicate unique value error to 409 RESOURCE_ALREADY_EXISTS", () => {
    const err = handlePrismaError({ code: "P2002" });
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, "RESOURCE_ALREADY_EXISTS");
  });

  it("should map P2025 resource not found error to 404 RESOURCE_NOT_FOUND", () => {
    const err = handlePrismaError({ code: "P2025" });
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "RESOURCE_NOT_FOUND");
  });

  it("should map P2003 foreign key constraint error to 409 RELATED_RESOURCE_CONSTRAINT", () => {
    const err = handlePrismaError({ code: "P2003" });
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, "RELATED_RESOURCE_CONSTRAINT");
  });

  it("should map P2014 required relation constraint error to 409 RELATION_CONSTRAINT", () => {
    const err = handlePrismaError({ code: "P2014" });
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, "RELATION_CONSTRAINT");
  });

  it("should return null for unknown Prisma error codes", () => {
    assert.equal(handlePrismaError({ code: "P9999" }), null);
  });
});
