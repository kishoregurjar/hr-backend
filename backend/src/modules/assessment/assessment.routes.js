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

const { companyContext } = require("../company/company.context.middleware");

router.use(requireAuth);

const hrRoute = (...middlewares) => [
  requireRole(AUTH_ROLES.SUPER_ADMIN, AUTH_ROLES.HR),
  companyContext,
  ...middlewares,
];

const adminRoute = (...middlewares) => [
  requireRole(AUTH_ROLES.SUPER_ADMIN),
  companyContext,
  ...middlewares,
];

router.get(
  "/",
  hrRoute(validateRequest(assessmentQuerySchema)),
  controller.list
);

router.post(
  "/",
  hrRoute(validateRequest(createAssessmentSchema)),
  controller.create
);

router.post(
  "/:id/questions",
  hrRoute(validateRequest(assignAssessmentQuestionsSchema)),
  controller.assignQuestions
);

router.patch(
  "/:id/questions/reorder",
  hrRoute(validateRequest(reorderAssessmentQuestionsSchema)),
  controller.reorderQuestions
);

router.post(
  "/:id/publish",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.publish
);

router.post(
  "/:id/unpublish",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.unpublish
);

router.post(
  "/:id/activate",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.activate
);

router.post(
  "/:id/archive",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.archive
);

router.post(
  "/:id/duplicate",
  hrRoute(validateRequest(duplicateAssessmentSchema)),
  controller.duplicate
);

router.patch(
  "/:id/restore",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.restore
);

router.post(
  "/:id/quarantine",
  adminRoute(validateRequest(assessmentIdParamSchema)),
  controller.quarantine
);

router.post(
  "/:id/resolve-quarantine",
  adminRoute(validateRequest(assessmentIdParamSchema)),
  controller.resolveQuarantine
);

router.get(
  "/:id",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.getById
);

router.patch(
  "/:id",
  hrRoute(validateRequest(updateAssessmentSchema)),
  controller.update
);

router.put(
  "/:id",
  hrRoute(validateRequest(updateAssessmentSchema)),
  controller.update
);

router.delete(
  "/bulk",
  hrRoute(),
  controller.bulkDelete
);

router.delete(
  "/all",
  hrRoute(),
  controller.deleteAll
);

router.delete(
  "/:id",
  hrRoute(validateRequest(assessmentIdParamSchema)),
  controller.delete
);

router.post(
  "/candidate-assessments/:candidateAssessmentId/finalize",
  controller.finalizeAssessment
);

router.use(require("./assessment.result.routes"));
router.use(require("./assessment.analytics.routes"));

module.exports = router;


