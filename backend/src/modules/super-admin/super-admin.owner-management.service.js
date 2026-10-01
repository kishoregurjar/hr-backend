"use strict";

const ownerRepository = require("./super-admin.owner-management.repository");
const {
  mapOwner,
  mapRevokedActivation,
} = require("./super-admin.owner-management.mapper");
const {
  buildOwnerResponse,
  buildActivationResponse,
} = require("./super-admin.owner-management.dto");
const {
  SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS,
} = require("./super-admin.owner-management.constants");
const auditService = require("../company/company.audit.service");
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require("../company/company.audit.constants");

const getCompanyOwner = async (companyId) => {
  const company = await ownerRepository.findCompanyById(companyId);

  if (!company) {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  const membership = await ownerRepository.findCompanyOwner(companyId);

  if (!membership) {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_NOT_FOUND;
    throw error;
  }

  const activation = await ownerRepository.findOwnerActivation(
    membership.user.id
  );

  return buildOwnerResponse(
    mapOwner({
      membership,
      activation,
    })
  );
};

const revokeOwnerActivation = async (
  companyId,
  auditContext = {},
  actorUserId = null
) => {
  const company = await ownerRepository.findCompanyById(companyId);

  if (!company) {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  const membership = await ownerRepository.findCompanyOwner(companyId);

  if (!membership) {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_NOT_FOUND;
    throw error;
  }

  if (membership.user.status === "ACTIVE") {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_ALREADY_ACTIVE
    );
    error.statusCode = 409;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.OWNER_ALREADY_ACTIVE;
    throw error;
  }

  const activation = await ownerRepository.findOwnerActivation(
    membership.user.id
  );

  if (!activation) {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_NOT_FOUND
    );
    error.statusCode = 404;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_NOT_FOUND;
    throw error;
  }

  if (activation.status === "CONSUMED") {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_ALREADY_CONSUMED
    );
    error.statusCode = 409;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_ALREADY_CONSUMED;
    throw error;
  }

  if (activation.status === "REVOKED") {
    const error = new Error(
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_ALREADY_REVOKED
    );
    error.statusCode = 409;
    error.code =
      SUPER_ADMIN_OWNER_MANAGEMENT_CONSTANTS.ERROR_CODES.ACTIVATION_ALREADY_REVOKED;
    throw error;
  }

  const now = new Date();
  const revoked = await ownerRepository.revokeOwnerActivation(
    activation.id,
    now
  );

  await auditService.createAuditLog({
    companyId,
    actorUserId,
    action: AUDIT_ACTIONS.OWNER_ACTIVATION_REVOKED,
    entityType: AUDIT_ENTITY_TYPES.COMPANY,
    entityId: companyId,
    metadata: {
      ownerId: membership.user.id,
      ownerEmail: membership.user.email,
    },
    ...auditContext,
  });

  return buildActivationResponse(mapRevokedActivation(revoked));
};

module.exports = {
  getCompanyOwner,
  revokeOwnerActivation,
};
