"use strict";

const crypto = require("crypto");
const sharp = require("sharp");

const companyRepository = require("./company.repository");
const { COMPANY_CONSTANTS } = require("./company.constants");
const {
  COMPANY_PERMISSIONS,
  assertPermission,
} = require("./company.authorization");
const { COMPANY_LOGO_CONSTANTS } = require("./company.logo.constants");
const {
  uploadCompanyLogo,
  deleteCompanyLogo,
} = require("./company.logo.storage");

const createCompanyError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const validateUploadedFile = (file) => {
  if (!file) {
    throw createCompanyError(
      "Company logo file is required",
      COMPANY_LOGO_CONSTANTS.ERROR_CODES.FILE_REQUIRED,
      400
    );
  }

  if (
    !COMPANY_LOGO_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype)
  ) {
    throw createCompanyError(
      "Invalid company logo file type",
      COMPANY_LOGO_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE,
      400
    );
  }

  if (file.size > COMPANY_LOGO_CONSTANTS.MAX_SIZE_BYTES) {
    throw createCompanyError(
      "Company logo file is too large",
      COMPANY_LOGO_CONSTANTS.ERROR_CODES.FILE_TOO_LARGE,
      413
    );
  }

  if (!Buffer.isBuffer(file.buffer)) {
    throw createCompanyError(
      "Invalid company logo file",
      COMPANY_LOGO_CONSTANTS.ERROR_CODES.INVALID_IMAGE,
      400
    );
  }
};

const processLogo = async (fileBuffer) => {
  try {
    return await sharp(fileBuffer)
      .rotate()
      .resize({
        width: COMPANY_LOGO_CONSTANTS.MAX_WIDTH,
        height: COMPANY_LOGO_CONSTANTS.MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 85,
      })
      .toBuffer();
  } catch (error) {
    const imageError = createCompanyError(
      "Invalid image file",
      COMPANY_LOGO_CONSTANTS.ERROR_CODES.INVALID_IMAGE,
      400
    );
    imageError.cause = error;
    throw imageError;
  }
};

const generateStoragePath = (companyId) => {
  return [
    COMPANY_LOGO_CONSTANTS.STORAGE_FOLDER,
    companyId,
    `${crypto.randomUUID()}.webp`,
  ].join("/");
};

const uploadLogo = async (companyId, role, file) => {
  validateUploadedFile(file);

  assertPermission(role, COMPANY_PERMISSIONS.UPLOAD_LOGO);

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  const processedBuffer = await processLogo(file.buffer);
  const newStoragePath = generateStoragePath(company.id);

  const uploadedLogo = await uploadCompanyLogo({
    fileBuffer: processedBuffer,
    contentType: COMPANY_LOGO_CONSTANTS.OUTPUT_MIME_TYPE,
    storagePath: newStoragePath,
  });

  const previousLogoPath = company.logoPath;

  try {
    const updatedCompany = await companyRepository.updateCompanyById(
      company.id,
      {
        logoUrl: uploadedLogo.publicUrl,
        logoPath: uploadedLogo.storagePath,
      }
    );

    if (
      previousLogoPath &&
      previousLogoPath !== uploadedLogo.storagePath
    ) {
      try {
        await deleteCompanyLogo(previousLogoPath);
      } catch (cleanupError) {
        console.error("Failed to delete previous company logo", {
          companyId: company.id,
          previousLogoPath,
          error: cleanupError,
        });
      }
    }

    return {
      companyId: updatedCompany.id,
      logoUrl: updatedCompany.logoUrl,
    };
  } catch (error) {
    try {
      await deleteCompanyLogo(uploadedLogo.storagePath);
    } catch (cleanupError) {
      console.error("Failed to cleanup newly uploaded company logo", {
        companyId: company.id,
        storagePath: uploadedLogo.storagePath,
        error: cleanupError,
      });
    }

    throw error;
  }
};

module.exports = {
  uploadLogo,
};
