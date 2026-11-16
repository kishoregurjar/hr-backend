"use strict";

const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const superAdminCompanyRepository = require("./super-admin.company.repository");
const { SUPER_ADMIN_COMPANY_CONSTANTS } = require("./super-admin.company.constants");
const ownerActivationService = require("./super-admin.owner-activation.service");
const { createOutboxEvent } = require("../company/company.outbox.repository");
const auditService = require("../company/company.audit.service");
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require("../company/company.audit.constants");
const { normalizeDomainString } = require("../../utils/tenant-url");

const generateSlugBase = (name) => {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `company-${crypto.randomUUID()}`;
};

const generateUniqueSlug = async (name, tx) => {
  const baseSlug = generateSlugBase(name);
  const existing = await superAdminCompanyRepository.findCompanyBySlug(
    baseSlug,
    tx
  );

  if (!existing) {
    return baseSlug;
  }

  return `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`;
};

const createCompanyWithOwner = async (
  {
    companyName,
    ownerName,
    ownerEmail,
    domainMode,
    website,
    domain,
    customDomain,
    industry,
    description,
    phone,
    address,
    city,
    country,
    plan,
    customSeatLimit,
    customCandidateLimit,
    customInviteLimit,
  },
  auditContext = {},
  actorUserId = null
) => {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingCompany =
          await superAdminCompanyRepository.findCompanyByName(companyName, tx);

        if (existingCompany) {
          const error = new Error(
            SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ALREADY_EXISTS
          );
          error.statusCode = 409;
          error.code =
            SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ALREADY_EXISTS;
          throw error;
        }

        const existingUser =
          await superAdminCompanyRepository.findUserByEmail(ownerEmail, tx);

        if (existingUser) {
          const error = new Error(
            SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.OWNER_EMAIL_ALREADY_EXISTS
          );
          error.statusCode = 409;
          error.code =
            SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.OWNER_EMAIL_ALREADY_EXISTS;
          throw error;
        }

        const isCustomDomainMode = domainMode === "CUSTOM_DOMAIN";
        const effectiveCustomDomain = isCustomDomainMode
          ? normalizeDomainString(customDomain || domain || null)
          : null;

        if (effectiveCustomDomain) {
          const existingDomain = await tx.company.findFirst({
            where: {
              customDomain: {
                equals: effectiveCustomDomain,
                mode: "insensitive",
              },
            },
          });
          if (existingDomain) {
            const error = new Error("This custom domain is already registered to another company.");
            error.statusCode = 409;
            error.code = "CUSTOM_DOMAIN_ALREADY_EXISTS";
            throw error;
          }
        }

        const slug = await generateUniqueSlug(companyName, tx);
        const effectiveWebsite = website || (effectiveCustomDomain ? `https://${effectiveCustomDomain}` : null);

        const company = await superAdminCompanyRepository.createCompany(
          {
            name: companyName,
            slug,
            website: effectiveWebsite ?? null,
            customDomain: effectiveCustomDomain ?? null,
            customDomainVerified: false,
            industry: industry ?? null,
            description: description ?? null,
            phone: phone ?? null,
            address: address ?? null,
            city: city ?? null,
            country: country ?? null,
            plan: (plan || "STARTER").toUpperCase(),
            planStatus: "ACTIVE",
            planStartedAt: new Date(),
            planExpiresAt:
              (plan || "").toUpperCase() === "DEMO"
                ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                : null,
            customSeatLimit:
              (plan || "").toUpperCase() === "ENTERPRISE" && customSeatLimit !== undefined && customSeatLimit !== null
                ? parseInt(customSeatLimit, 10)
                : null,
            customCandidateLimit:
              (plan || "").toUpperCase() === "ENTERPRISE" && customCandidateLimit !== undefined && customCandidateLimit !== null
                ? parseInt(customCandidateLimit, 10)
                : null,
            customInviteLimit:
              (plan || "").toUpperCase() === "ENTERPRISE" && customInviteLimit !== undefined && customInviteLimit !== null
                ? parseInt(customInviteLimit, 10)
                : null,
          },
          tx
        );

        const owner = await superAdminCompanyRepository.createUser(
          {
            email: ownerEmail,
            name: ownerName || ownerEmail.split("@")[0],
            password: null,
            status: "INVITED",
            role: "HR",
          },
          tx
        );

        const companyOwner =
          await superAdminCompanyRepository.createCompanyOwner(
            {
              companyId: company.id,
              userId: owner.id,
              role: "OWNER",
            },
            tx
          );

        const { activation, rawToken, activationUrl } =
          await ownerActivationService.createOwnerActivation(owner.id, tx, company);

        const emailDelivery = await tx.emailDelivery.create({
          data: {
            type: "COMPANY_OWNER_ACTIVATION",
            activationId: activation.id,
            recipientEmail: ownerEmail,
            status: "PENDING",
          },
        });

        await createOutboxEvent(
          {
            eventType: "COMPANY_OWNER_ACTIVATION_EMAIL",
            aggregateId: activation.id,
            payload: {
              emailDeliveryId: emailDelivery.id,
              activationId: activation.id,
            },
          },
          tx
        );

        await auditService.createAuditLog(
          {
            companyId: company.id,
            actorUserId,
            action: AUDIT_ACTIONS.COMPANY_CREATED,
            entityType: AUDIT_ENTITY_TYPES.COMPANY,
            entityId: company.id,
            metadata: {
              companyName: company.name,
              companySlug: company.slug,
              domainMode: isCustomDomainMode ? "CUSTOM_DOMAIN" : "SUBDOMAIN",
              customDomain: effectiveCustomDomain,
              ownerEmail,
              ownerName,
            },
            ...auditContext,
          },
          tx
        );

        return {
          company,
          owner,
          companyOwner,
          activation,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );
  } catch (error) {
    if (error.code === "P2002") {
      const conflictError = new Error(
        SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_CREATION_FAILED
      );
      conflictError.statusCode = 409;
      conflictError.code =
        SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_CREATION_FAILED;
      throw conflictError;
    }

    throw error;
  }
};

const {
  mapCompanyListItem,
  mapCompanyDetail,
  mapCompanyStatus,
} = require("./super-admin.company.mapper");
const { buildCompanyListResponse } = require("./super-admin.company.dto");

const buildCompanyWhere = ({ search, status }) => {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        slug: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
};

const listCompanies = async ({ page, limit, search, status, sortBy, sortOrder }) => {
  const skip = (page - 1) * limit;
  const where = buildCompanyWhere({ search, status });
  const orderBy = { [sortBy]: sortOrder };

  const result = await superAdminCompanyRepository.findCompanies({
    where,
    skip,
    take: limit,
    orderBy,
  });

  return buildCompanyListResponse({
    companies: result.companies.map(mapCompanyListItem),
    page,
    limit,
    total: result.total,
  });
};

const getCompany = async (companyId) => {
  const company = await superAdminCompanyRepository.findCompanyById(companyId);

  if (!company) {
    const error = new Error(
      SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code = SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  const { getCompanyUsage } = require("../plan");
  const planData = await getCompanyUsage(company);

  const mapped = mapCompanyDetail(company);
  return {
    ...mapped,
    plan: planData.plan,
    planName: planData.planName,
    planStatus: planData.planStatus,
    planStartedAt: planData.planStartedAt,
    planExpiresAt: planData.planExpiresAt,
    activeSubscription: planData.activeSubscription,
    demoRemaining: planData.demoRemaining,
    limits: planData.limits,
    usage: planData.usage,
  };
};

const updateCompanyPlan = async (
  companyId,
  payload,
  auditContext = {},
  actorUserId = null
) => {
  const company = await superAdminCompanyRepository.findCompanyById(companyId);

  if (!company) {
    const error = new Error(
      SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code = SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  const { assignCompanyPlan } = require("../plan");
  const previousPlan = company.plan;
  const previousStatus = company.planStatus;

  await assignCompanyPlan(companyId, payload);

  // Invalidate cached user sessions and context
  try {
    const { clearCompanyContextCache } = require("../company/company.context");
    const { clearUserCache } = require("../../middleware/requireAuth");
    const members = await prisma.companyMember.findMany({
      where: { companyId },
      select: { userId: true },
    });
    for (const member of members) {
      if (clearUserCache) clearUserCache(member.userId);
      if (clearCompanyContextCache) clearCompanyContextCache(member.userId);
    }
  } catch (_) {}

  await auditService.createAuditLog({
    companyId,
    actorUserId,
    action: "COMPANY_PLAN_UPDATED",
    entityType: AUDIT_ENTITY_TYPES.COMPANY,
    entityId: companyId,
    metadata: {
      previousPlan,
      newPlan: payload.plan,
      previousStatus,
      newStatus: payload.planStatus,
    },
    ...auditContext,
  });

  return getCompany(companyId);
};

const updateCompanyStatus = async (
  companyId,
  status,
  auditContext = {},
  actorUserId = null
) => {
  const company = await superAdminCompanyRepository.findCompanyById(companyId);

  if (!company) {
    const error = new Error(
      SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND
    );
    error.statusCode = 404;
    error.code = SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND;
    throw error;
  }

  if (company.status === status) {
    const code =
      status === SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.ACTIVE
        ? SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ALREADY_ACTIVE
        : SUPER_ADMIN_COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ALREADY_SUSPENDED;

    const error = new Error(code);
    error.statusCode = 409;
    error.code = code;
    throw error;
  }

  const previousStatus = company.status;
  const updatedCompany = await superAdminCompanyRepository.updateCompanyStatus(
    companyId,
    status
  );

  // Invalidate cached user sessions and context for all company members
  try {
    const { clearCompanyContextCache } = require("../company/company.context");
    const { clearUserCache } = require("../../middleware/requireAuth");
    const authRepository = require("../auth/auth.repository");

    const members = await prisma.companyMember.findMany({
      where: { companyId },
      select: { userId: true },
    });

    for (const member of members) {
      if (clearUserCache) clearUserCache(member.userId);
      if (clearCompanyContextCache) clearCompanyContextCache(member.userId);
      if (status === SUPER_ADMIN_COMPANY_CONSTANTS.STATUS.SUSPENDED) {
        await authRepository.revokeAllUserRefreshTokens(prisma, member.userId);
      }
    }
  } catch (cacheErr) {
    console.error("[updateCompanyStatus] Member session cache invalidation warning:", cacheErr);
  }

  await auditService.createAuditLog({
    companyId,
    actorUserId,
    action: AUDIT_ACTIONS.COMPANY_STATUS_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.COMPANY,
    entityId: companyId,
    metadata: {
      previousStatus,
      newStatus: status,
    },
    ...auditContext,
  });

  return mapCompanyStatus(updatedCompany);
};

module.exports = {
  createCompanyWithOwner,
  listCompanies,
  getCompany,
  updateCompanyStatus,
  updateCompanyPlan,
};
