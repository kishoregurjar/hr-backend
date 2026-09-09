"use strict";

const { SUPER_ADMIN_CONSTANTS } = require("./super-admin.constants");

const assertSuperAdmin = (user) => {
  if (!user || user.role !== "SUPER_ADMIN") {
    const error = new Error(
      SUPER_ADMIN_CONSTANTS.ERROR_CODES.SUPER_ADMIN_ACCESS_DENIED
    );
    error.statusCode = 403;
    error.code = SUPER_ADMIN_CONSTANTS.ERROR_CODES.SUPER_ADMIN_ACCESS_DENIED;
    throw error;
  }
};

module.exports = {
  assertSuperAdmin,
};
