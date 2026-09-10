"use strict";

const mapCompany = (company) => {
  if (!company) {
    return null;
  }

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    logoUrl: company.logoUrl,
    website: company.website,
    websiteUrl: company.website,
    industry: company.industry,
    email: company.email,
    officialEmail: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    country: company.country,
    description: company.description,
    about: company.description,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
};

const mapCompanyMember = (member) => {
  if (!member) {
    return null;
  }

  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    email: member.user?.email || member.email || null,
    name: member.user?.name || member.name || null,
    user: member.user
      ? {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name,
        }
      : null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
};

module.exports = {
  mapCompany,
  mapCompanyMember,
};
