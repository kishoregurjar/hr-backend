"use strict";

class FailureInjection {
  constructor() {
    this.failures = new Map();
  }

  enable(point, error = null) {
    if (typeof point !== "string" || point.trim().length === 0) {
      throw new TypeError("Failure injection point is required");
    }

    const normalizedPoint = point.trim();

    const injectedError =
      error instanceof Error
        ? error
        : new Error(
            error
              ? String(error)
              : `Injected failure: ${normalizedPoint}`
          );

    this.failures.set(normalizedPoint, injectedError);
  }

  disable(point) {
    if (typeof point !== "string" || point.trim().length === 0) {
      return;
    }

    this.failures.delete(point.trim());
  }

  clear() {
    this.failures.clear();
  }

  isEnabled(point) {
    if (typeof point !== "string" || point.trim().length === 0) {
      return false;
    }

    return this.failures.has(point.trim());
  }

  throwIfEnabled(point) {
    if (!this.isEnabled(point)) {
      return;
    }

    const error = this.failures.get(point.trim());

    throw error;
  }
}

const failureInjection = new FailureInjection();

module.exports = {
  FailureInjection,
  failureInjection,
};
