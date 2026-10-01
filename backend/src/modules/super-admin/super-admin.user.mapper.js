"use strict";

/**
 * Map user entity to list item representation for Super Admin User Directory
 * Follows exact naming and safety conventions of super-admin.company.mapper.js
 */
const mapUserListItem = (user) => {
  if (!user) {
    return null;
  }

  const members = Array.isArray(user.companyMembers) ? user.companyMembers : [];

  // Preference 1: Find membership with role OWNER
  // Preference 2: Fallback to any valid membership with company name
  const primaryMembership =
    members.find((m) => m?.role === "OWNER" && m?.company?.name) ||
    members.find((m) => m?.company?.name);

  const companyName = primaryMembership?.company?.name || "Independent";

  return {
    id: user.id,
    name: user.name || "User",
    email: user.email,
    company: companyName,
    role: user.role,
    status: user.status || "ACTIVE",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

/**
 * Map detailed user entity for Super Admin view
 */
const mapUserDetail = (user) => {
  if (!user) {
    return null;
  }

  const members = Array.isArray(user.companyMembers) ? user.companyMembers : [];

  const primaryMembership =
    members.find((m) => m?.role === "OWNER" && m?.company?.name) ||
    members.find((m) => m?.company?.name);

  const companyName = primaryMembership?.company?.name || "Independent";

  return {
    id: user.id,
    name: user.name || "User",
    email: user.email,
    company: companyName,
    role: user.role,
    status: user.status || "ACTIVE",
    companies: members
      .filter((m) => m?.company?.name)
      .map((m) => ({
        id: m.company.id,
        name: m.company.name,
        slug: m.company.slug,
        memberRole: m.role,
      })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

module.exports = {
  mapUserListItem,
  mapUserDetail,
};
