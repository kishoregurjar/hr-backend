"use strict";

const auditRepository = require("../company/company.audit.repository");

/**
 * Service function to list platform audit logs with filtering and server-side pagination.
 */
const listAuditLogs = async ({
  page = 1,
  limit = 20,
  actorUserId,
  companyId,
  action,
  entityType,
  entityId,
  dateFrom,
  dateTo,
  search,
}) => {
  const skip = (page - 1) * limit;

  const filterParams = {
    companyId,
    actorUserId,
    action,
    entityType,
    entityId,
    dateFrom,
    dateTo,
    search,
  };

  const [logs, total] = await Promise.all([
    auditRepository.findAuditLogs({
      ...filterParams,
      skip,
      take: limit,
    }),
    auditRepository.countAuditLogs(filterParams),
  ]);

  const totalPages = Math.ceil(total / limit) || 0;

  return {
    items: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = {
  listAuditLogs,
};
