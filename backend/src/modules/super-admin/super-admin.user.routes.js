"use strict";

const express = require("express");
const router = express.Router();

const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminUserController = require("./super-admin.user.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin User Directory Endpoints
 * Base Path: /api/v1/super-admin
 */
router.get(
  "/users",
  requireAuth,
  requireSuperAdmin,
  superAdminUserController.listUsers
);

module.exports = router;
