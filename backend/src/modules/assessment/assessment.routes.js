const express = require("express");
const router = express.Router();

const validateRequest = require("../../middleware/validate.middleware");
const requireAuth = require("../../middleware/requireAuth");
const requireRole = require("../../middleware/requireRole");
const { AUTH_ROLES } = require("../auth/auth.constants");

const controller = require("./assessment.controller");
const {
  createAssessmentSchema,
  assessmentQuerySchema,
  assessmentIdParamSchema,
  updateAssessmentSchema,
  assignAssessmentQuestionsSchema,
  reorderAssessmentQuestionsSchema,
  duplicateAssessmentSchema,
} = require("./assessment.validator");

router.use(requireAuth);

router.get(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentQuerySchema),
  controller.list
);

router.post(
  "/",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(createAssessmentSchema),
  controller.create
);

router.post(
  "/:id/questions",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assignAssessmentQuestionsSchema),
  controller.assignQuestions
);

router.patch(
  "/:id/questions/reorder",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(reorderAssessmentQuestionsSchema),
  controller.reorderQuestions
);

router.post(
  "/:id/publish",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.publish
);

router.post(
  "/:id/unpublish",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.unpublish
);

router.post(
  "/:id/activate",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.activate
);

router.post(
  "/:id/archive",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.archive
);

router.post(
  "/:id/duplicate",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(duplicateAssessmentSchema),
  controller.duplicate
);

router.patch(
  "/:id/restore",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.restore
);

router.get(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.getById
);

router.patch(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateAssessmentSchema),
  controller.update
);

router.put(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(updateAssessmentSchema),
  controller.update
);

router.delete(
  "/:id",
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  validateRequest(assessmentIdParamSchema),
  controller.delete
);

module.exports = router;
