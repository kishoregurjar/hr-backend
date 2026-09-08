"use strict";

const COMPANY_LOGO_CONSTANTS = Object.freeze({
  MAX_SIZE_BYTES: 2 * 1024 * 1024,

  ALLOWED_MIME_TYPES: Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),

  ALLOWED_EXTENSIONS: Object.freeze([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ]),

  STORAGE_FOLDER: "company-logos",

  OUTPUT_FORMAT: "webp",

  OUTPUT_MIME_TYPE: "image/webp",

  MAX_WIDTH: 512,

  MAX_HEIGHT: 512,

  ERROR_CODES: Object.freeze({
    FILE_REQUIRED: "COMPANY_LOGO_FILE_REQUIRED",
    INVALID_FILE_TYPE: "COMPANY_LOGO_INVALID_FILE_TYPE",
    FILE_TOO_LARGE: "COMPANY_LOGO_FILE_TOO_LARGE",
    INVALID_IMAGE: "COMPANY_LOGO_INVALID_IMAGE",
    UPLOAD_FAILED: "COMPANY_LOGO_UPLOAD_FAILED",
    DELETE_FAILED: "COMPANY_LOGO_DELETE_FAILED",
    URL_GENERATION_FAILED: "COMPANY_LOGO_URL_GENERATION_FAILED",
  }),
});

module.exports = {
  COMPANY_LOGO_CONSTANTS,
};
