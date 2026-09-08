"use strict";

const mapCompany = (company) => {
  if (!company) {
    return null;
  }

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    logoUrl: company.logoUrl,
    website: company.website,
    industry: company.industry,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    country: company.country,
    description: company.description,
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
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
};

module.exports = {
  mapCompany,
  mapCompanyMember,
};
