const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");

const controller = require("./tag.controller");
const {
  createTagSchema,
  updateTagSchema,
  tagIdParamSchema,
  tagQuerySchema,
} = require("./tag.validator");

router.use(requireAuth);

router.get(
  "/",
  validateRequest(tagQuerySchema),
  controller.list
);

router.get(
  "/:id",
  validateRequest(tagIdParamSchema),
  controller.getById
);

router.post(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(createTagSchema),
  controller.create
);

router.patch(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateTagSchema),
  controller.update
);

router.put(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateTagSchema),
  controller.update
);

router.delete(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(tagIdParamSchema),
  controller.delete
);

router.patch(
  "/:id/restore",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(tagIdParamSchema),
  controller.restore
);

module.exports = router;
