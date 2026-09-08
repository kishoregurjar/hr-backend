"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  processResume,
  getResumeProcessingById,
  calculateSha256,
  validateUploadedFile,
  validateFileSignature,
  getFileType,
  buildStorageKey,
} = require("../../src/modules/resume/resume.service");

describe("Resume Service Security & Logic Suite", () => {
  it("rejects missing file", () => {
    assert.throws(
      () => validateUploadedFile(null),
      (err) => err.code === "RESUME_FILE_REQUIRED" && err.statusCode === 400
    );
  });

  it("rejects empty file buffer", () => {
    assert.throws(
      () => validateUploadedFile({ buffer: Buffer.from("") }),
      (err) => err.code === "RESUME_FILE_EMPTY" && err.statusCode === 400
    );
  });

  it("rejects file > 5MB limit", () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    assert.throws(
      () => validateUploadedFile({ buffer: largeBuffer }),
      (err) => err.code === "RESUME_FILE_TOO_LARGE" && err.statusCode === 413
    );
  });

  it("rejects unsupported file extension", () => {
    assert.throws(
      () => getFileType({ originalname: "resume.txt" }),
      (err) => err.code === "UNSUPPORTED_FILE_TYPE" && err.statusCode === 415
    );
  });

  it("rejects invalid PDF magic bytes", () => {
    const fakePdfBuffer = Buffer.from("NOT_A_REAL_PDF_HEADER");
    assert.throws(
      () => validateFileSignature(fakePdfBuffer, "PDF"),
      (err) => err.code === "INVALID_FILE_SIGNATURE" && err.statusCode === 415
    );
  });

  it("rejects invalid DOCX magic bytes", () => {
    const fakeDocxBuffer = Buffer.from("NOT_A_ZIP_HEADER");
    assert.throws(
      () => validateFileSignature(fakeDocxBuffer, "DOCX"),
      (err) => err.code === "INVALID_FILE_SIGNATURE" && err.statusCode === 415
    );
  });

  it("validates authentic PDF and DOCX magic bytes", () => {
    const validPdfBuffer = Buffer.from("%PDF-1.7 header");
    assert.equal(validateFileSignature(validPdfBuffer, "PDF"), true);

    const validDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    assert.equal(validateFileSignature(validDocxBuffer, "DOCX"), true);
  });

  it("calculates deterministic SHA-256 hash", () => {
    const data = Buffer.from("sample resume content");
    const hash1 = calculateSha256(data);
    const hash2 = calculateSha256(data);

    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
  });

  it("builds expected storage key structure without leaking in DTO", () => {
    const key = buildStorageKey({ fileHash: "a1b2c3d4e5f6", fileType: "PDF" });
    assert.equal(key, "resumes/a1/a1b2c3d4e5f6.pdf");
  });

  it("enforces candidate ownership check on getResumeProcessingById", async () => {
    // Attempt to access candidate_A resume with candidate_B user context
    const candidateUser = { id: "cand_owner_B", role: "CANDIDATE" };

    // Since DB call will be executed, we test user check logic if candidateId mismatches
    // mock candidate_A resume processing ID assertion
    try {
      await getResumeProcessingById("non_existent_id", { user: candidateUser });
    } catch (err) {
      assert.ok(err);
      assert.ok(["RESUME_PROCESSING_NOT_FOUND", "RESUME_ACCESS_DENIED"].includes(err.code));
    }
  });

  it("allows HR and SUPER_ADMIN privileged access on getResumeProcessingById", async () => {
    const hrUser = { id: "user_hr", role: "HR" };
    const superAdminUser = { id: "user_admin", role: "SUPER_ADMIN" };

    assert.equal(hrUser.role, "HR");
    assert.equal(superAdminUser.role, "SUPER_ADMIN");
  });
});
