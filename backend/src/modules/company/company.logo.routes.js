"use strict";

const express = require("express");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { companyContext } = require("./company.context.middleware");
const { uploadCompanyLogo } = require("./company.logo.middleware");
const companyLogoController = require("./company.logo.controller");

const router = express.Router();

router.post(
  ["/logo", "/me/logo"],
  requireAuth,
  requireRole(["HR", "SUPER_ADMIN"]),
  companyContext,
  uploadCompanyLogo,
  companyLogoController.uploadLogo
);

module.exports = router;
