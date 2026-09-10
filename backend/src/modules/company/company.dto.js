"use strict";

const createCompanyDto = (company) => ({
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
});

const createCompanyMemberDto = (member) => ({
  id: member.id,
  userId: member.userId,
  role: member.role,
  email: member.email,
  name: member.name,
  user: member.user,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
});

const createCompanyMemberListDto = ({
  members,
  total,
  page,
  limit,
}) => ({
  members: members.map(createCompanyMemberDto),
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});

module.exports = {
  createCompanyDto,
  createCompanyMemberDto,
  createCompanyMemberListDto,
};
