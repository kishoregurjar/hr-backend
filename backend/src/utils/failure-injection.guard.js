"use strict";

function assertFailureInjectionAllowed() {
  const environment = String(process.env.NODE_ENV || "development")
    .trim()
    .toLowerCase();

  if (environment === "production") {
    const error = new Error("Failure injection is disabled in production");
    error.code = "FAILURE_INJECTION_DISABLED";
    throw error;
  }
}

module.exports = {
  assertFailureInjectionAllowed,
};
