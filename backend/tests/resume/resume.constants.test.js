"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const constants = require("../../src/modules/resume/resume.constants");

describe("Resume Constants Suite", () => {
  it("defines correct file size limits", () => {
    assert.equal(constants.MAX_RESUME_SIZE_BYTES, 5 * 1024 * 1024);
    assert.equal(constants.MAX_RESUME_FILE_SIZE, 5 * 1024 * 1024);
  });

  it("defines allowed extensions and MIME types", () => {
    assert.deepEqual(Array.from(constants.ALLOWED_RESUME_EXTENSIONS), [
      ".pdf",
      ".docx",
    ]);
    assert.deepEqual(Array.from(constants.ALLOWED_RESUME_MIME_TYPES), [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
  });

  it("defines fixed resume field name", () => {
    assert.equal(constants.RESUME_FILE_FIELD_NAME, "resume");
  });

  it("defines expected upload limits and parser version", () => {
    assert.equal(constants.PARSER_VERSION, "1.0.0");
    assert.equal(constants.RESUME_UPLOAD_LIMITS.files, 1);
    assert.equal(
      constants.RESUME_UPLOAD_LIMITS.fileSize,
      5 * 1024 * 1024
    );
  });

  it("defines frozen error codes and status constants", () => {
    assert.equal(
      constants.RESUME_ERROR_CODES.FILE_REQUIRED,
      "RESUME_FILE_REQUIRED"
    );
    assert.equal(
      constants.RESUME_ERROR_CODES.FILE_TOO_LARGE,
      "RESUME_FILE_TOO_LARGE"
    );
    assert.equal(
      constants.RESUME_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
      "UNSUPPORTED_FILE_TYPE"
    );
    assert.equal(
      constants.RESUME_ERROR_CODES.INVALID_FILE_SIGNATURE,
      "INVALID_FILE_SIGNATURE"
    );
  });
});
