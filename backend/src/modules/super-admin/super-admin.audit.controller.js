"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { listAuditLogsSchema } = require("./super-admin.audit.validator");
const superAdminAuditService = require("./super-admin.audit.service");

class SuperAdminAuditController {
  listAuditLogs = asyncHandler(async (req, res) => {
    const query = listAuditLogsSchema.parse(req.query);
    const result = await superAdminAuditService.listAuditLogs(query);

    return SuccessResponse.send(
      res,
      {
        message: "Audit logs retrieved successfully",
        data: result,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SuperAdminAuditController();
