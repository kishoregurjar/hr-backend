"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const {
  listUsersSchema,
  invitePlatformAdminSchema,
  userIdParamSchema,
} = require("./super-admin.user.validator");
const superAdminUserService = require("./super-admin.user.service");
const auditService = require("../company/company.audit.service");

class SuperAdminUserController {
  listUsers = asyncHandler(async (req, res) => {
    const query = listUsersSchema.parse(req.query);
    const result = await superAdminUserService.listUsers(query);

    return SuccessResponse.send(
      res,
      {
        message: "Users retrieved successfully",
        data: result,
      },
      StatusCodes.OK
    );
  });

  invitePlatformAdmin = asyncHandler(async (req, res) => {
    const validatedData = invitePlatformAdminSchema.parse(req.body);
    const auditContext = auditService.createRequestAuditContext(req);
    const actorUserId = req.user?.id || null;
    const user = await superAdminUserService.invitePlatformAdmin(
      validatedData,
      auditContext,
      actorUserId
    );

    return SuccessResponse.send(
      res,
      {
        message: "Platform Admin invitation created and queued successfully",
        data: { user },
      },
      StatusCodes.CREATED
    );
  });

  resendPlatformAdminInvitation = asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const auditContext = auditService.createRequestAuditContext(req);
    const actorUserId = req.user?.id || null;
    const user = await superAdminUserService.resendPlatformAdminInvitation(
      userId,
      auditContext,
      actorUserId
    );

    return SuccessResponse.send(
      res,
      {
        message: "Platform Admin invitation email queued successfully",
        data: { user },
      },
      StatusCodes.ACCEPTED
    );
  });
}

module.exports = new SuperAdminUserController();
