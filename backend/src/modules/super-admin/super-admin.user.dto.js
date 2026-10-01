"use strict";

const { mapUserListItem } = require("./super-admin.user.mapper");

const toUserListItemResponse = (user) => {
  return mapUserListItem(user);
};

const buildPagination = ({ page, limit, total }) => {
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

const buildUserListResponse = ({ users, page, limit, total }) => ({
  users,
  pagination: buildPagination({
    page,
    limit,
    total,
  }),
});

module.exports = {
  toUserListItemResponse,
  buildPagination,
  buildUserListResponse,
};
