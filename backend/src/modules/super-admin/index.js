"use strict";

const express = require("express");
const router = express.Router();

const superAdminCompanyRoutes = require("./super-admin.company.routes");
const superAdminDashboardRoutes = require("./super-admin.dashboard.routes");
const superAdminOwnerManagementRoutes = require("./super-admin.owner-management.routes");

router.use("/companies", superAdminOwnerManagementRoutes);
router.use(superAdminCompanyRoutes);
router.use(superAdminDashboardRoutes);

module.exports = router;
