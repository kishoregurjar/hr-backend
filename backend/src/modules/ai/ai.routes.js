const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const aiController = require("./ai.controller");

// Require authentication for all AI Copilot interactions
router.use(requireAuth);

router.post("/chat", aiController.chat);
router.get("/status", aiController.getStatus);

module.exports = router;

