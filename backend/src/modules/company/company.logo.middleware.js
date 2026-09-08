"use strict";

const multer = require("multer");
const { COMPANY_LOGO_CONSTANTS } = require("./company.logo.constants");

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: COMPANY_LOGO_CONSTANTS.MAX_SIZE_BYTES,
    files: 1,
  },

  fileFilter: (req, file, cb) => {
    if (
      !COMPANY_LOGO_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype)
    ) {
      const error = new Error("Invalid company logo file type");
      error.code = COMPANY_LOGO_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE;
      error.statusCode = 400;
      return cb(error);
    }

    cb(null, true);
  },
});

const uploadCompanyLogo = (req, res, next) => {
  upload.single("logo")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        const fileSizeError = new Error(
          "Company logo file size must not exceed 2 MB"
        );
        fileSizeError.code =
          COMPANY_LOGO_CONSTANTS.ERROR_CODES.FILE_TOO_LARGE;
        fileSizeError.statusCode = 413;
        return next(fileSizeError);
      }

      const uploadError = new Error("Invalid company logo upload");
      uploadError.code = COMPANY_LOGO_CONSTANTS.ERROR_CODES.UPLOAD_FAILED;
      uploadError.statusCode = 400;
      return next(uploadError);
    }

    next(error);
  });
};

module.exports = {
  uploadCompanyLogo,
};
