"use strict";

const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { assertSuperAdmin } = require("./super-admin.authorization");
const controller = require("./super-admin.trial-requests.controller");

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

router.get("/trial-requests", controller.listRequests);
router.get("/trial-requests/:id", controller.getRequestDetails);
router.post("/trial-requests/:id/approve", controller.approveRequest);
router.post("/trial-requests/:id/reject", controller.rejectRequest);
router.post("/trial-requests/:id/resend-approval-email", controller.resendApprovalEmail);

module.exports = router;

