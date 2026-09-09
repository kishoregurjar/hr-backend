"use strict";

const {
  mapSuperAdminCompany,
  mapCompanyOwner,
} = require("./super-admin.company.mapper");

const toCreateCompanyResponse = ({ company, owner, companyOwner }) => {
  return {
    company: mapSuperAdminCompany(company),
    owner: mapCompanyOwner(owner, companyOwner),
  };
};

const buildPagination = ({ page, limit, total }) => {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

const buildCompanyListResponse = ({ companies, page, limit, total }) => ({
  companies,
  pagination: buildPagination({
    page,
    limit,
    total,
  }),
});

module.exports = {
  toCreateCompanyResponse,
  buildPagination,
  buildCompanyListResponse,
};
