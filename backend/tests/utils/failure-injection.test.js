"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { FailureInjection } = require("../../src/utils/failure-injection");

describe("FailureInjection", () => {
  let injector;

  beforeEach(() => {
    injector = new FailureInjection();
  });

  afterEach(() => {
    injector.clear();
  });

  it("should enable a failure", () => {
    injector.enable("TEST_POINT");

    assert.equal(injector.isEnabled("TEST_POINT"), true);
  });

  it("should throw configured error", () => {
    const error = new Error("Injected database failure");

    injector.enable("TEST_POINT", error);

    assert.throws(
      () => injector.throwIfEnabled("TEST_POINT"),
      {
        message: "Injected database failure",
      }
    );
  });

  it("should not throw when failure is disabled", () => {
    assert.doesNotThrow(() => {
      injector.throwIfEnabled("TEST_POINT");
    });
  });

  it("should disable a failure", () => {
    injector.enable("TEST_POINT");

    injector.disable("TEST_POINT");

    assert.equal(injector.isEnabled("TEST_POINT"), false);
  });

  it("should clear all failures", () => {
    injector.enable("POINT_A");
    injector.enable("POINT_B");

    injector.clear();

    assert.equal(injector.isEnabled("POINT_A"), false);
    assert.equal(injector.isEnabled("POINT_B"), false);
  });

  it("should reject invalid failure point", () => {
    assert.throws(() => injector.enable(""), TypeError);
  });
});
