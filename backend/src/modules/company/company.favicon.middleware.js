"use strict";

const multer = require("multer");
const { COMPANY_CONSTANTS } = require("./company.constants");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: COMPANY_CONSTANTS.BRANDING.FAVICON.MAX_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (
      !COMPANY_CONSTANTS.BRANDING.FAVICON.ALLOWED_MIME_TYPES.includes(
        file.mimetype
      )
    ) {
      const error = new Error(
        "Invalid favicon file type. Allowed formats: ICO, PNG, WEBP, JPEG"
      );
      error.code = COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE;
      error.statusCode = 400;
      return cb(error);
    }

    cb(null, true);
  },
});

const uploadCompanyFaviconMiddleware = (req, res, next) => {
  upload.single("favicon")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        const fileSizeError = new Error(
          "Favicon file size must not exceed 512 KB"
        );
        fileSizeError.code =
          COMPANY_CONSTANTS.ERROR_CODES.FAVICON_TOO_LARGE;
        fileSizeError.statusCode = 413;
        return next(fileSizeError);
      }

      const uploadError = new Error("Invalid favicon upload");
      uploadError.code = COMPANY_CONSTANTS.ERROR_CODES.FAVICON_UPLOAD_FAILED;
      uploadError.statusCode = 400;
      return next(uploadError);
    }

    next(error);
  });
};

module.exports = {
  uploadCompanyFaviconMiddleware,
};

