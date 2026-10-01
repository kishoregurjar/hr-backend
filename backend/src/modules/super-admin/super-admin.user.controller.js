"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { listUsersSchema } = require("./super-admin.user.validator");
const superAdminUserService = require("./super-admin.user.service");

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
}

module.exports = new SuperAdminUserController();
