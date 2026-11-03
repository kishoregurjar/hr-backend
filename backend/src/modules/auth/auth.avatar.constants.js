"use strict";

const AUTH_AVATAR_CONSTANTS = Object.freeze({
  MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB

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

  STORAGE_BUCKET: process.env.SUPABASE_PROFILE_PHOTOS_BUCKET || "profile-photos",

  OUTPUT_FORMAT: "webp",

  OUTPUT_MIME_TYPE: "image/webp",

  OUTPUT_WIDTH: 400,

  OUTPUT_HEIGHT: 400,

  ERROR_CODES: Object.freeze({
    FILE_REQUIRED: "AVATAR_FILE_REQUIRED",
    INVALID_FILE_TYPE: "AVATAR_INVALID_FILE_TYPE",
    FILE_TOO_LARGE: "AVATAR_FILE_TOO_LARGE",
    INVALID_IMAGE: "AVATAR_INVALID_IMAGE",
    UPLOAD_FAILED: "AVATAR_UPLOAD_FAILED",
    DELETE_FAILED: "AVATAR_DELETE_FAILED",
    URL_GENERATION_FAILED: "AVATAR_URL_GENERATION_FAILED",
    USER_NOT_FOUND: "USER_NOT_FOUND",
    UNAUTHORIZED: "AVATAR_UNAUTHORIZED",
  }),
});

module.exports = {
  AUTH_AVATAR_CONSTANTS,
};

