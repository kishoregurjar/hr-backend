"use strict";

const crypto = require("node:crypto");

const stableSerialize = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const keys = Object.keys(value).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
};

const createRequestHash = (payload) => {
  const serialized = stableSerialize(payload);

  return crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex");
};

module.exports = {
  createRequestHash,
  stableSerialize,
};
