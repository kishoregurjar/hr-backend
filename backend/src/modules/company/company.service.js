"use strict";

const { prisma } = require("../../config/prisma");

const companyRepository = require("./company.repository");
const { COMPANY_CONSTANTS } = require("./company.constants");
const {
  COMPANY_PERMISSIONS,
  assertPermission,
  assertOwner,
  assertCanManageMember,
  assertCanRemoveMember,
} = require("./company.authorization");

const {
  createCompanyDto,
  createCompanyMemberDto,
  createCompanyMemberListDto,
} = require("./company.dto");

const { mapCompany, mapCompanyMember } = require("./company.mapper");

const {
  createCompanySchema,
  updateCompanySchema,
  inviteCompanyMemberSchema,
  updateCompanyMemberRoleSchema,
  transferCompanyOwnershipSchema,
  deleteCompanySchema,
} = require("./company.validator");

const {
  findInvitationIdsByCompany,
} = require("./company.invitation.repository");

const {
  deleteEventsByAggregateIds,
} = require("./company.outbox.repository");

const {
  COMPANY_OUTBOX_CONSTANTS,
} = require("./company.outbox.constants");

const {
  deleteCompanyLogo,
} = require("./company.logo.storage");

const auditService = require("./company.audit.service");
const {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} = require("./company.audit.constants");

const { AppError } = require("../../utils/app-error");

const createCompanyError = (message, code, statusCode) => {
  return new AppError(message, {
    statusCode: statusCode || 400,
    code: code || "COMPANY_ERROR",
    isOperational: true,
  });
};

const normalizeSlug = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const generateUniqueSlug = async (name, tx = prisma) => {
  const baseSlug = normalizeSlug(name);

  let slug = baseSlug;
  let counter = 1;

  while (await companyRepository.findCompanyBySlug(slug, tx)) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
};

const createCompany = async (userId, payload, auditContext = {}) => {
  const validatedData = createCompanySchema.parse(payload);

  return prisma.$transaction(async (tx) => {
    const existingMembership =
      await companyRepository.findCompanyByMemberUserId(userId, tx);

    if (existingMembership) {
      const error = new Error("User already belongs to a company");
      error.code = COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ALREADY_EXISTS;
      throw error;
    }

    const slug = await generateUniqueSlug(validatedData.name, tx);

    const company = await companyRepository.createCompany(
      {
        ...validatedData,
        slug,
      },
      tx
    );

    const owner = await companyRepository.createMember(
      {
        companyId: company.id,
        userId,
        role: "OWNER",
      },
      tx
    );

    await auditService.createAuditLog(
      {
        companyId: company.id,
        actorUserId: userId,
        action: AUDIT_ACTIONS.COMPANY_CREATED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY,
        entityId: company.id,
        metadata: {
          companyName: company.name,
          companySlug: company.slug,
        },
        ...auditContext,
      },
      tx
    );

    return {
      company: createCompanyDto(mapCompany(company)),
      membership: createCompanyMemberDto(mapCompanyMember(owner)),
    };
  });
};

const getMyCompany = async (companyId, role) => {
  assertPermission(role, COMPANY_PERMISSIONS.VIEW_COMPANY);

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  return createCompanyDto(mapCompany(company));
};

const updateMyCompany = async (
  companyId,
  role,
  payload,
  userId = null,
  auditContext = {}
) => {
  assertPermission(role, COMPANY_PERMISSIONS.UPDATE_COMPANY);

  const validatedData = updateCompanySchema.parse(payload);

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
        action: AUDIT_ACTIONS.COMPANY_UPDATED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY,
        entityId: companyId,
        metadata: {
          changedFields: Object.keys(validatedData),
        },
        ...auditContext,
      },
      tx
    );

    return createCompanyDto(mapCompany(updatedCompany));
  });
};

const listMembers = async (companyId, role, { page = 1, limit = 20 } = {}) => {
  assertPermission(role, COMPANY_PERMISSIONS.VIEW_MEMBERS);

  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [members, total] = await Promise.all([
    companyRepository.findCompanyMembers(companyId, {
      skip,
      take: normalizedLimit,
    }),
    companyRepository.countCompanyMembers(companyId),
  ]);

  return createCompanyMemberListDto({
    members: members.map(mapCompanyMember),
    total,
    page: normalizedPage,
    limit: normalizedLimit,
  });
};

const inviteMember = async (companyId, role, payload) => {
  assertPermission(role, COMPANY_PERMISSIONS.INVITE_MEMBER);

  const validatedData = inviteCompanyMemberSchema.parse(payload);

  return prisma.$transaction(async (tx) => {
    const existingMember = await companyRepository.findMember(
      companyId,
      validatedData.userId,
      tx
    );

    if (existingMember) {
      const error = new Error("User is already a member of this company");
      error.code =
        COMPANY_CONSTANTS.ERROR_CODES.COMPANY_MEMBER_ALREADY_EXISTS;
      throw error;
    }

    const member = await companyRepository.createMember(
      {
        companyId,
        userId: validatedData.userId,
        role: validatedData.role,
      },
      tx
    );

    return createCompanyMemberDto(mapCompanyMember(member));
  });
};

const updateMemberRole = async (
  companyIdOrOptions,
  requesterRoleArg,
  memberIdArg,
  payloadArg,
  requesterUserIdArg = null,
  auditContextArg = {}
) => {
  const options =
    typeof companyIdOrOptions === "object" && companyIdOrOptions !== null
      ? companyIdOrOptions
      : {
          companyId: companyIdOrOptions,
          actorRole: requesterRoleArg,
          memberId: memberIdArg,
          role:
            typeof payloadArg === "object" && payloadArg !== null
              ? payloadArg.role
              : payloadArg,
          actorUserId: requesterUserIdArg,
          auditContext: auditContextArg,
        };

  const {
    companyId,
    actorRole = requesterRoleArg,
    memberId = memberIdArg,
    role = typeof payloadArg === "object" && payloadArg !== null
      ? payloadArg.role
      : payloadArg,
    actorUserId = requesterUserIdArg,
    auditContext = auditContextArg,
  } = options;

  assertCanManageMember(actorRole);

  const member = await companyRepository.findMemberForUpdate(
    companyId,
    memberId,
    prisma
  );

  if (!member || member.companyId !== companyId) {
    throw createCompanyError(
      "Company member not found",
      COMPANY_CONSTANTS.ERROR_CODES.MEMBER_NOT_FOUND,
      404
    );
  }

  if (actorUserId && member.userId === actorUserId) {
    throw createCompanyError(
      "Cannot modify your own membership role",
      COMPANY_CONSTANTS.ERROR_CODES.CANNOT_MODIFY_SELF,
      409
    );
  }

  if (member.role === "OWNER") {
    throw createCompanyError(
      "Company owner role cannot be changed directly",
      COMPANY_CONSTANTS.ERROR_CODES.OWNER_CANNOT_CHANGE_ROLE,
      409
    );
  }

  if (actorRole === "ADMIN" && member.role === "ADMIN") {
    throw createCompanyError(
      "Administrators cannot modify another administrator",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      403
    );
  }

  const updatedMember = await prisma.$transaction(async (tx) => {
    const updated = await companyRepository.updateMemberRole(
      member.id,
      role,
      tx
    );

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId: actorUserId,
        action: AUDIT_ACTIONS.MEMBER_ROLE_UPDATED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_MEMBER,
        entityId: memberId,
        metadata: {
          previousRole: member.role,
          newRole: role,
        },
        ...auditContext,
      },
      tx
    );

    return updated;
  });

  return createCompanyMemberDto(mapCompanyMember(updatedMember));
};

const removeMember = async (
  companyIdOrOptions,
  requesterRoleArg,
  memberIdArg,
  requesterUserIdArg = null,
  auditContextArg = {}
) => {
  const options =
    typeof companyIdOrOptions === "object" && companyIdOrOptions !== null
      ? companyIdOrOptions
      : {
          companyId: companyIdOrOptions,
          actorRole: requesterRoleArg,
          memberId: memberIdArg,
          actorUserId: requesterUserIdArg,
          auditContext: auditContextArg,
        };

  const {
    companyId,
    actorRole = requesterRoleArg,
    memberId = memberIdArg,
    actorUserId = requesterUserIdArg,
    auditContext = auditContextArg,
  } = options;

  assertCanRemoveMember(actorRole);

  const member = await companyRepository.findMemberForUpdate(
    companyId,
    memberId,
    prisma
  );

  if (!member || member.companyId !== companyId) {
    throw createCompanyError(
      "Company member not found",
      COMPANY_CONSTANTS.ERROR_CODES.MEMBER_NOT_FOUND,
      404
    );
  }

  if (actorUserId && member.userId === actorUserId) {
    throw createCompanyError(
      "Cannot remove yourself from the company",
      COMPANY_CONSTANTS.ERROR_CODES.CANNOT_MODIFY_SELF,
      409
    );
  }

  if (member.role === "OWNER") {
    throw createCompanyError(
      "Company owner cannot be removed",
      COMPANY_CONSTANTS.ERROR_CODES.MEMBER_CANNOT_REMOVE_OWNER,
      409
    );
  }

  if (actorRole === "ADMIN" && member.role === "ADMIN") {
    throw createCompanyError(
      "Administrators cannot remove another administrator",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED,
      403
    );
  }

  await prisma.$transaction(async (tx) => {
    await companyRepository.deleteMember(member.id, tx);

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId: actorUserId,
        action: AUDIT_ACTIONS.MEMBER_REMOVED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_MEMBER,
        entityId: memberId,
        metadata: {
          removedUserId: member.userId,
          previousRole: member.role,
        },
        ...auditContext,
      },
      tx
    );
  });

  return {
    memberId: member.id,
  };
};

const transferOwnership = async (
  companyIdOrOptions,
  currentUserIdArg,
  currentRoleArg,
  payloadArg,
  auditContextArg = {}
) => {
  const options =
    typeof companyIdOrOptions === "object" && companyIdOrOptions !== null
      ? companyIdOrOptions
      : {
          companyId: companyIdOrOptions,
          currentOwnerUserId: currentUserIdArg,
          actorRole: currentRoleArg,
          targetMemberId:
            typeof payloadArg === "object" && payloadArg !== null
              ? payloadArg.targetMemberId || payloadArg.memberId
              : payloadArg,
          auditContext: auditContextArg,
        };

  const {
    companyId,
    currentOwnerUserId = currentUserIdArg,
    targetMemberId = typeof payloadArg === "object" && payloadArg !== null
      ? payloadArg.targetMemberId || payloadArg.memberId
      : payloadArg,
    auditContext = auditContextArg,
  } = options;

  const currentOwner = await companyRepository.findMember(
    companyId,
    currentOwnerUserId
  );

  if (!currentOwner || currentOwner.role !== "OWNER") {
    throw createCompanyError(
      "Company owner status required",
      COMPANY_CONSTANTS.ERROR_CODES.OWNER_REQUIRED,
      403
    );
  }

  if (currentOwner.id === targetMemberId) {
    throw createCompanyError(
      "Target member is already the company owner",
      COMPANY_CONSTANTS.ERROR_CODES.OWNERSHIP_TRANSFER_TARGET_INVALID,
      409
    );
  }

  const targetMember = await companyRepository.findMemberById(targetMemberId);

  if (!targetMember || targetMember.companyId !== companyId) {
    throw createCompanyError(
      "Target company member not found",
      COMPANY_CONSTANTS.ERROR_CODES.OWNERSHIP_TRANSFER_TARGET_INVALID,
      404
    );
  }

  if (targetMember.role === "OWNER") {
    throw createCompanyError(
      "Target member is already an owner",
      COMPANY_CONSTANTS.ERROR_CODES.OWNERSHIP_TRANSFER_TARGET_INVALID,
      409
    );
  }

  const newOwner = await companyRepository.transferOwnership({
    companyId,
    currentOwnerMemberId: currentOwner.id,
    targetMemberId,
  });

  await auditService.createAuditLog({
    companyId,
    actorUserId: currentOwnerUserId,
    action: AUDIT_ACTIONS.OWNERSHIP_TRANSFERRED,
    entityType: AUDIT_ENTITY_TYPES.COMPANY,
    entityId: companyId,
    metadata: {
      previousOwnerUserId: currentOwnerUserId,
      newOwnerUserId: targetMember.userId,
      previousOwnerMemberId: currentOwner.id,
      newOwnerMemberId: targetMember.id,
    },
    ...auditContext,
  });

  return createCompanyMemberDto(mapCompanyMember(newOwner));
};

const deleteCompany = async (
  companyId,
  requesterRole,
  payload,
  requesterUserId = null,
  auditContext = {}
) => {
  const validatedData = deleteCompanySchema.parse(payload);

  assertOwner(requesterRole);

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createCompanyError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  if (validatedData.confirmation !== company.name) {
    throw createCompanyError(
      "Company name confirmation is invalid",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_DELETE_CONFIRMATION_INVALID,
      400
    );
  }

  const jobCount = await companyRepository.countCompanyJobs(companyId);

  if (jobCount > 0) {
    throw createCompanyError(
      "Company cannot be deleted while jobs exist. Archive or remove the jobs first.",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_HAS_JOBS,
      409
    );
  }

  const logoPath = company.logoPath;

  await prisma.$transaction(async (tx) => {
    const invitationIds = await findInvitationIdsByCompany(companyId, tx);

    await deleteEventsByAggregateIds(
      invitationIds,
      COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.COMPANY_INVITATION_EMAIL,
      tx
    );

    await auditService.createAuditLog(
      {
        companyId: company.id,
        actorUserId: requesterUserId,
        action: AUDIT_ACTIONS.COMPANY_DELETED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY,
        entityId: company.id,
        metadata: {
          companyName: company.name,
          companySlug: company.slug,
        },
        ...auditContext,
      },
      tx
    );

    await companyRepository.deleteCompanyById(companyId, tx);
  });

  if (logoPath) {
    try {
      await deleteCompanyLogo(logoPath);
    } catch (cleanupError) {
      console.error("Company deleted but logo cleanup failed", {
        companyId,
        logoPath,
        error: cleanupError,
      });
    }
  }

  return {
    companyId,
    deleted: true,
  };
};

module.exports = {
  createCompany,
  getMyCompany,
  updateMyCompany,
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  transferOwnership,
  deleteCompany,
};

