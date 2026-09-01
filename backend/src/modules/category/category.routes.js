const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");

const controller = require("./category.controller");
const {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  categoryQuerySchema,
} = require("./category.validator");

router.use(requireAuth);

router.get(
  "/",
  validateRequest(categoryQuerySchema),
  controller.list
);

router.get(
  "/:id",
  validateRequest(categoryIdParamSchema),
  controller.getById
);

router.post(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(createCategorySchema),
  controller.create
);

router.patch(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateCategorySchema),
  controller.update
);

router.put(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateCategorySchema),
  controller.update
);

router.delete(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(categoryIdParamSchema),
  controller.delete
);

router.patch(
  "/:id/restore",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(categoryIdParamSchema),
  controller.restore
);

module.exports = router;
