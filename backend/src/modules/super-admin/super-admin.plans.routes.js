"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const superAdminPlansController = require("./super-admin.plans.controller");

const requireSuperAdmin = (req, res, next) => {
  try {
    assertSuperAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/plans", superAdminPlansController.listPlans);
router.post("/plans", superAdminPlansController.createPlan);
router.patch("/plans/:id", superAdminPlansController.updatePlan);
router.patch("/plans/:id/status", superAdminPlansController.toggleStatus);
router.delete("/plans/:id", superAdminPlansController.deletePlan);

module.exports = router;

