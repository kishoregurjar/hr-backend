"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Database health service suite", () => {
  it("should expose database health service contract", () => {
    const service = require("../../src/services/database.health.service");

    assert.equal(typeof service.getDatabaseHealth, "function");
  });
});
