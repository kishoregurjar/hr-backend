"use strict";

const superAdminUserRepository = require("./super-admin.user.repository");
const { mapUserListItem } = require("./super-admin.user.mapper");
const { buildUserListResponse } = require("./super-admin.user.dto");

/**
 * Pure helper function to construct Prisma where clauses for user directory search/filters
 */
const buildUserWhere = ({ search, role, status }) => {
  const where = {};

  if (role) {
    where.role = role;
  }

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
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
};

/**
 * List platform users for Super Admin directory with pagination, filtering, and sorting
 */
const listUsers = async ({
  page,
  limit,
  search,
  role,
  status,
  sortBy,
  sortOrder,
}) => {
  const skip = (page - 1) * limit;
  const where = buildUserWhere({ search, role, status });
  const orderBy = { [sortBy]: sortOrder };

  const result = await superAdminUserRepository.findUsers({
    where,
    skip,
    take: limit,
    orderBy,
  });

  return buildUserListResponse({
    users: result.users.map(mapUserListItem),
    page,
    limit,
    total: result.total,
  });
};

module.exports = {
  buildUserWhere,
  listUsers,
};
