"use strict";

const express = require("express");
const router = express.Router();

const superAdminCompanyRoutes = require("./super-admin.company.routes");
const superAdminDashboardRoutes = require("./super-admin.dashboard.routes");
const superAdminOwnerManagementRoutes = require("./super-admin.owner-management.routes");
const superAdminGameRoutes = require("../game/game.super-admin.routes");
const { supportSuperAdminRoutes } = require("../support");
const { publicContactSuperAdminRoutes } = require("../public-contact");

router.use("/games", superAdminGameRoutes);
router.use("/companies", superAdminOwnerManagementRoutes);
router.use("/support", supportSuperAdminRoutes);
router.use("/contact-inquiries", publicContactSuperAdminRoutes);
router.use(superAdminCompanyRoutes);
router.use(superAdminDashboardRoutes);

module.exports = router;
