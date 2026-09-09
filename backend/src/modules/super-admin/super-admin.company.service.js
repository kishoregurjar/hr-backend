"use strict";

const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const superAdminCompanyRepository = require("./super-admin.company.repository");
const { SUPER_ADMIN_COMPANY_CONSTANTS } = require("./super-admin.company.constants");
const ownerActivationService = require("./super-admin.owner-activation.service");
const { createOutboxEvent } = require("../company/company.outbox.repository");

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

const createCompanyWithOwner = async ({
  companyName,
  ownerName,
  ownerEmail,
  website,
  industry,
  description,
  phone,
  address,
  city,
  country,
}) => {
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

        const slug = await generateUniqueSlug(companyName, tx);

        const company = await superAdminCompanyRepository.createCompany(
          {
            name: companyName,
            slug,
            website: website ?? null,
            industry: industry ?? null,
            description: description ?? null,
            phone: phone ?? null,
            address: address ?? null,
            city: city ?? null,
            country: country ?? null,
          },
          tx
        );

        const owner = await superAdminCompanyRepository.createUser(
          {
            email: ownerEmail,
            name: ownerName,
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
          await ownerActivationService.createOwnerActivation(owner.id, tx);

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

  return mapCompanyDetail(company);
};

const updateCompanyStatus = async (companyId, status) => {
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

  const updatedCompany = await superAdminCompanyRepository.updateCompanyStatus(
    companyId,
    status
  );

  return mapCompanyStatus(updatedCompany);
};

module.exports = {
  createCompanyWithOwner,
  listCompanies,
  getCompany,
  updateCompanyStatus,
};
