const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");

const controller = require("./question.controller");
const {
  createQuestionSchema,
  updateQuestionSchema,
  questionIdParamSchema,
  questionQuerySchema,
} = require("./question.validator");

router.use(requireAuth);

router.get(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(questionQuerySchema),
  controller.list
);

router.post(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(createQuestionSchema),
  controller.create
);

router.post(
  "/:id/publish",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(questionIdParamSchema),
  controller.publish
);

router.post(
  "/:id/archive",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(questionIdParamSchema),
  controller.archive
);

router.get(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(questionIdParamSchema),
  controller.getById
);

router.patch(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateQuestionSchema),
  controller.update
);

router.put(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateQuestionSchema),
  controller.update
);

router.delete(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(questionIdParamSchema),
  controller.delete
);

module.exports = router;
