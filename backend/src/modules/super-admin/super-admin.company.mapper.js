"use strict";

const { resolveCompanyOrigin } = require("../../utils/tenant-url");

const mapSuperAdminCompany = (company) => {
  if (!company) {
    return null;
  }

  const domainMode = company.customDomain ? "CUSTOM_DOMAIN" : "SUBDOMAIN";
  const localPreviewUrl = resolveCompanyOrigin(company);

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    domainMode,
    customDomain: company.customDomain || null,
    customDomainVerified: company.customDomainVerified || false,
    localPreviewUrl,
    logoUrl: company.logoUrl || null,
    website: company.website || null,
    industry: company.industry || null,
    email: company.email || null,
    phone: company.phone || null,
    address: company.address || null,
    city: company.city || null,
    country: company.country || null,
    description: company.description || null,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
};

const mapCompanyOwner = (owner, companyMember) => {
  if (!owner) {
    return null;
  }

  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    status: owner.status,
    role: companyMember?.role || "OWNER",
  };
};

const mapCompanyListItem = (company) => {
  const ownerMember = (company.members || []).find((m) => m.role === "OWNER");
  const domainMode = company.customDomain ? "CUSTOM_DOMAIN" : "SUBDOMAIN";
  const localPreviewUrl = resolveCompanyOrigin(company);

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    domainMode,
    customDomain: company.customDomain || null,
    customDomainVerified: company.customDomainVerified || false,
    localPreviewUrl,
    status: company.status,
    logoUrl: company.logoUrl,
    industry: company.industry,
    email: company.email,
    city: company.city,
    country: company.country,
    owner: ownerMember && ownerMember.user
      ? {
          id: ownerMember.user.id,
          name: ownerMember.user.name,
          email: ownerMember.user.email,
          status: ownerMember.user.status,
          role: ownerMember.role,
        }
      : null,
    memberCount: company._count?.members || 0,
    jobCount: company._count?.jobs || 0,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
};

const mapCompanyDetail = (company) => {
  const ownerMember = (company.members || []).find((m) => m.role === "OWNER");
  const domainMode = company.customDomain ? "CUSTOM_DOMAIN" : "SUBDOMAIN";
  const localPreviewUrl = resolveCompanyOrigin(company);

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    domainMode,
    customDomain: company.customDomain || null,
    customDomainVerified: company.customDomainVerified || false,
    localPreviewUrl,
    status: company.status,
    logoUrl: company.logoUrl,
    website: company.website,
    industry: company.industry,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    country: company.country,
    description: company.description,
    owner: ownerMember && ownerMember.user
      ? {
          id: ownerMember.user.id,
          name: ownerMember.user.name,
          email: ownerMember.user.email,
          status: ownerMember.user.status,
          role: ownerMember.role,
        }
      : null,
    members: (company.members || []).map((member) => ({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        status: member.user.status,
        createdAt: member.user.createdAt,
      },
    })),
    invitations: (company.invitations || []).map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    })),
    statistics: {
      memberCount: company._count?.members || 0,
      jobCount: company._count?.jobs || 0,
      invitationCount: company._count?.invitations || 0,
    },
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
};

const mapCompanyStatus = (company) => ({
  id: company.id,
  name: company.name,
  slug: company.slug,
  status: company.status,
  updatedAt: company.updatedAt,
});

module.exports = {
  mapSuperAdminCompany,
  mapCompanyOwner,
  mapCompanyListItem,
  mapCompanyDetail,
  mapCompanyStatus,
};
