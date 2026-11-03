"use strict";

const multer = require("multer");
const { AUTH_AVATAR_CONSTANTS } = require("./auth.avatar.constants");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: AUTH_AVATAR_CONSTANTS.MAX_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!AUTH_AVATAR_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const error = new Error("Invalid avatar file type. Allowed formats: JPEG, PNG, WebP.");
      error.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE;
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

const uploadAvatarMiddleware = (req, res, next) => {
  // Support 'avatar', 'photo', or 'file' field names from multipart forms
  const uploadHandler = upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "file", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]);

  uploadHandler(req, res, (error) => {
    if (!error) {
      if (req.files) {
        req.file =
          req.files.avatar?.[0] ||
          req.files.file?.[0] ||
          req.files.photo?.[0] ||
          null;
      }
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        const fileSizeError = new Error("Profile photo file size must not exceed 5 MB.");
        fileSizeError.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.FILE_TOO_LARGE;
        fileSizeError.statusCode = 413;
        return next(fileSizeError);
      }

      const uploadError = new Error("Invalid profile photo upload: " + error.message);
      uploadError.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.UPLOAD_FAILED;
      uploadError.statusCode = 400;
      return next(uploadError);
    }

    next(error);
  });
};

module.exports = {
  uploadAvatarMiddleware,
};

