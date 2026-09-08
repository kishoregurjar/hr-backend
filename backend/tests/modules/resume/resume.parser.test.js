"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractEmail,
  extractPhone,
  extractSkills,
  extractExperienceYears,
  extractName,
  parseCandidateData,
  calculateFileHash,
} = require("../../../src/modules/resume/resume.parser.service");

describe("Resume Parser Unit Test Suite", () => {
  it("should extract email address", () => {
    assert.equal(
      extractEmail("Contact: Shivam@example.com"),
      "shivam@example.com"
    );
  });

  it("should extract phone number", () => {
    assert.ok(extractPhone("Phone: +91 9876543210"));
  });

  it("should extract known skills from dictionary", () => {
    const skills = extractSkills("Node.js Express.js PostgreSQL Docker React");

    assert.ok(skills.includes("Node.js"));
    assert.ok(skills.includes("PostgreSQL"));
    assert.ok(skills.includes("Docker"));
  });

  it("should extract experience years", () => {
    assert.equal(
      extractExperienceYears("3+ years of professional experience"),
      3
    );
  });

  it("should extract candidate name from document header", () => {
    assert.equal(
      extractName(
        "Shivam Singh\nBackend Developer\nshivam@example.com",
        "shivam@example.com"
      ),
      "Shivam Singh"
    );
  });

  it("should parse complete candidate data block", () => {
    const result = parseCandidateData(`
        Shivam Singh
        Backend Developer
        Email: shivam@example.com
        Phone: +91 9876543210

        Skills:
        Node.js, Express.js, PostgreSQL, Docker

        3+ years of professional experience
      `);

    assert.equal(result.email, "shivam@example.com");
    assert.ok(result.phone);
    assert.ok(result.skills.includes("Node.js"));
    assert.equal(result.totalExperienceYears, 3);
  });

  it("should generate deterministic SHA-256 hash", () => {
    const buffer = Buffer.from("resume-content");

    const first = calculateFileHash(buffer);
    const second = calculateFileHash(buffer);

    assert.equal(first, second);
    assert.equal(first.length, 64);
  });

  it("should generate different hashes for different resume buffers", () => {
    const first = calculateFileHash(Buffer.from("resume-a"));
    const second = calculateFileHash(Buffer.from("resume-b"));

    assert.notEqual(first, second);
  });
});
