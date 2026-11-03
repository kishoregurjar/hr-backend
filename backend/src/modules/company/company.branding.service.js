"use strict";

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
  toPublicBrandingDTO,
  updateBrandingSchema,
} = require("./company.branding.dto");

const createCompanyError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

/**
 * Retrieves the public-safe branding DTO for an authenticated company.
 *
 * @param {string} companyId - UUID of the company
 * @returns {Promise<Object>} Public branding DTO
 */
const getBranding = async (companyId) => {
  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  return toPublicBrandingDTO(company);
};

/**
 * Updates company white-label branding settings.
 * Enforces strict authorization (OWNER or ADMIN only, RECRUITER receives 403).
 * Sanitizes and validates all incoming data, rejects arbitrary fields,
 * and creates an immutable audit log entry.
 *
 * @param {string} companyId - UUID of the target company (from authenticated context)
 * @param {string} role - Authenticated user's company role
 * @param {Object} payload - Branding fields to update
 * @param {string|null} userId - ID of the actor
 * @param {Object} auditContext - Additional audit metadata (IP, userAgent)
 * @returns {Promise<Object>} Updated public branding DTO
 */
const updateBranding = async (
  companyId,
  role,
  payload,
  userId = null,
  auditContext = {}
) => {
  assertPermission(role, COMPANY_PERMISSIONS.UPDATE_BRANDING);

  const validatedData = updateBrandingSchema.parse(payload);

  const existingCompany = await companyRepository.findCompanyById(companyId);
  if (!existingCompany) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  return prisma.$transaction(async (tx) => {
    const updatedCompany = await companyRepository.updateCompanyById(
      companyId,
      validatedData,
      tx
    );

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId: userId,
        action: AUDIT_ACTIONS.COMPANY_BRANDING_UPDATED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_BRANDING,
        entityId: companyId,
        metadata: {
          changedFields: Object.keys(validatedData),
        },
        ...auditContext,
      },
      tx
    );

    return toPublicBrandingDTO(updatedCompany);
  });
};

/**
 * Retrieves public branding for an unauthenticated candidate portal by company slug.
 *
 * @param {string} slug - Unique company slug
 * @returns {Promise<Object>} Public branding DTO
 */
const getPublicBrandingBySlug = async (slug) => {
  if (!slug || typeof slug !== "string") {
    throw createCompanyError(
      "Company slug is required",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      400
    );
  }

  const company = await companyRepository.findCompanyBySlug(slug.trim());

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  return toPublicBrandingDTO(company);
};

module.exports = {
  getBranding,
  updateBranding,
  getPublicBrandingBySlug,
};

