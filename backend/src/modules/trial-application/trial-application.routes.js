"use strict";

const express = require("express");
const router = express.Router();
const trialApplicationController = require("./trial-application.controller");

// Public endpoints
router.post("/send-otp", trialApplicationController.sendOtp);
router.post("/apply", trialApplicationController.applyTrial);

module.exports = router;

