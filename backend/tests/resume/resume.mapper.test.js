"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const mapper = require("../../src/modules/resume/resume.mapper");

describe("Resume Mapper Suite", () => {
  it("strips sensitive internal fields (storageKey, fileHash) from DTO", () => {
    const rawResume = {
      id: "res_123",
      status: "COMPLETED",
      source: "DIRECT_UPLOAD",
      fileType: "PDF",
      fileName: "candidate.pdf",
      fileSize: 482193,
      confidenceScore: 0.94,
      candidateId: "cand_123",
      processedAt: new Date("2026-09-07T04:31:00.000Z"),
      storageKey: "resumes/ab/123.pdf",
      fileHash: "a1b2c3d4e5f6",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = mapper.toResumeProcessingDto(rawResume);

    assert.equal(dto.id, "res_123");
    assert.equal(dto.status, "COMPLETED");
    assert.equal(dto.candidateId, "cand_123");
    assert.equal(dto.storageKey, undefined);
    assert.equal(dto.fileHash, undefined);
  });

  it("maps job application to DTO cleanly", () => {
    const rawApp = {
      id: "app_123",
      jobId: "job_123",
      candidateId: "cand_123",
      candidateName: "John Doe",
      source: "DIRECT_UPLOAD",
      status: "APPLIED",
      appliedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = mapper.toJobApplicationDto(rawApp);

    assert.equal(dto.id, "app_123");
    assert.equal(dto.jobId, "job_123");
    assert.equal(dto.candidateId, "cand_123");
    assert.equal(dto.candidateName, "John Doe");
    assert.equal(dto.status, "APPLIED");
  });

  it("splits full name into firstName and lastName", () => {
    const name1 = mapper.splitName("Jane Smith");
    assert.equal(name1.firstName, "Jane");
    assert.equal(name1.lastName, "Smith");

    const name2 = mapper.splitName("John");
    assert.equal(name2.firstName, "John");
    assert.equal(name2.lastName, "");
  });

  it("normalizes emails", () => {
    assert.equal(mapper.normalizeEmail(" TEST@Domain.Com "), "test@domain.com");
    assert.equal(mapper.normalizeEmail(null), null);
  });
});
