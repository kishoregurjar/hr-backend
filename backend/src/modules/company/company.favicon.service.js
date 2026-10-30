"use strict";

const crypto = require("crypto");
const sharp = require("sharp");

const { prisma } = require("../../config/prisma");
const companyRepository = require("./company.repository");
const auditService = require("./company.audit.service");
const { COMPANY_CONSTANTS } = require("./company.constants");
const {
  COMPANY_PERMISSIONS,
  assertPermission,
} = require("./company.authorization");
const {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} = require("./company.audit.constants");
const {
  uploadCompanyFavicon,
  deleteCompanyFavicon,
} = require("./company.favicon.storage");

const createCompanyError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const validateFaviconFile = (file) => {
  if (!file) {
    throw createCompanyError(
      "Company favicon file is required",
      COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE,
      400
    );
  }

  if (
    !COMPANY_CONSTANTS.BRANDING.FAVICON.ALLOWED_MIME_TYPES.includes(
      file.mimetype
    )
  ) {
    throw createCompanyError(
      "Invalid company favicon file type",
      COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE,
      400
    );
  }

  if (file.size > COMPANY_CONSTANTS.BRANDING.FAVICON.MAX_SIZE_BYTES) {
    throw createCompanyError(
      "Company favicon file is too large",
      COMPANY_CONSTANTS.ERROR_CODES.FAVICON_TOO_LARGE,
      413
    );
  }

  if (!Buffer.isBuffer(file.buffer)) {
    throw createCompanyError(
      "Invalid company favicon file buffer",
      COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE,
      400
    );
  }
};

const processFavicon = async (fileBuffer) => {
  try {
    return await sharp(fileBuffer)
      .rotate()
      .resize({
        width: COMPANY_CONSTANTS.BRANDING.FAVICON.MAX_WIDTH,
        height: COMPANY_CONSTANTS.BRANDING.FAVICON.MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 90,
      })
      .toBuffer();
  } catch (error) {
    const imageError = createCompanyError(
      "Invalid image file for favicon",
      COMPANY_CONSTANTS.ERROR_CODES.INVALID_FAVICON_TYPE,
      400
    );
    imageError.cause = error;
    throw imageError;
  }
};

const generateFaviconStoragePath = (companyId) => {
  return [
    COMPANY_CONSTANTS.BRANDING.FAVICON.STORAGE_FOLDER,
    companyId,
    `${crypto.randomUUID()}.${COMPANY_CONSTANTS.BRANDING.FAVICON.OUTPUT_FORMAT}`,
  ].join("/");
};

const uploadFavicon = async (
  companyId,
  role,
  file,
  userId = null,
  auditContext = {}
) => {
  validateFaviconFile(file);

  assertPermission(role, COMPANY_PERMISSIONS.UPDATE_BRANDING);

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  const processedBuffer = await processFavicon(file.buffer);
  const newStoragePath = generateFaviconStoragePath(company.id);

  const uploadedFavicon = await uploadCompanyFavicon({
    fileBuffer: processedBuffer,
    contentType: COMPANY_CONSTANTS.BRANDING.FAVICON.OUTPUT_MIME_TYPE,
    storagePath: newStoragePath,
  });

  const previousFaviconPath = company.faviconPath;

  try {
    return await prisma.$transaction(async (tx) => {
      const updatedCompany = await companyRepository.updateCompanyById(
        company.id,
        {
          faviconUrl: uploadedFavicon.publicUrl,
          faviconPath: uploadedFavicon.storagePath,
        },
        tx
      );

      await auditService.createAuditLog(
        {
          companyId: company.id,
          actorUserId: userId,
          action: AUDIT_ACTIONS.COMPANY_FAVICON_UPLOADED,
          entityType: AUDIT_ENTITY_TYPES.COMPANY_FAVICON,
          entityId: company.id,
          metadata: {
            faviconUrl: uploadedFavicon.publicUrl,
          },
          ...auditContext,
        },
        tx
      );

      if (
        previousFaviconPath &&
        previousFaviconPath !== uploadedFavicon.storagePath
      ) {
        try {
          await deleteCompanyFavicon(previousFaviconPath);
        } catch (cleanupError) {
          console.error("Failed to delete previous company favicon", {
            companyId: company.id,
            previousFaviconPath,
            error: cleanupError,
          });
        }
      }

      return {
        companyId: updatedCompany.id,
        faviconUrl: updatedCompany.faviconUrl,
      };
    });
  } catch (error) {
    try {
      await deleteCompanyFavicon(uploadedFavicon.storagePath);
    } catch (cleanupError) {
      console.error("Failed to cleanup newly uploaded company favicon", {
        companyId: company.id,
        storagePath: uploadedFavicon.storagePath,
        error: cleanupError,
      });
    }

    throw error;
  }
};

const deleteFavicon = async (
  companyId,
  role,
  userId = null,
  auditContext = {}
) => {
  assertPermission(role, COMPANY_PERMISSIONS.UPDATE_BRANDING);

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  const previousFaviconPath = company.faviconPath;

  return prisma.$transaction(async (tx) => {
    const updatedCompany = await companyRepository.updateCompanyById(
      company.id,
      {
        faviconUrl: null,
        faviconPath: null,
      },
      tx
    );

    await auditService.createAuditLog(
      {
        companyId: company.id,
        actorUserId: userId,
        action: AUDIT_ACTIONS.COMPANY_FAVICON_REMOVED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_FAVICON,
        entityId: company.id,
        metadata: {
          previousFaviconPath,
        },
        ...auditContext,
      },
      tx
    );

    if (previousFaviconPath) {
      try {
        await deleteCompanyFavicon(previousFaviconPath);
      } catch (cleanupError) {
        console.error("Failed to delete removed company favicon from storage", {
          companyId: company.id,
          previousFaviconPath,
          error: cleanupError,
        });
      }
    }

    return {
      companyId: updatedCompany.id,
      faviconUrl: null,
    };
  });
};

module.exports = {
  uploadFavicon,
  deleteFavicon,
  validateFaviconFile,
  processFavicon,
};

