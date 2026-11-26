"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const trialApplicationService = require("./trial-application.service");

class TrialApplicationController {
  /**
   * Send Email OTP for Trial Registration
   * POST /api/v1/trial-applications/send-otp
   */
  sendOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const clientIp = req.ip || req.connection?.remoteAddress || null;

    const result = await trialApplicationService.sendOtp({
      email,
      ipAddress: clientIp,
    });

    return SuccessResponse.send(res, result, StatusCodes.OK);
  });

  /**
   * Verify Email OTP
   * POST /api/v1/trial-applications/verify-otp
   */
  verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const result = await trialApplicationService.verifyOtp({ email, otp });
    return SuccessResponse.send(res, result, StatusCodes.OK);
  });

  /**
   * Submit Trial Application (PENDING_REVIEW)
   * POST /api/v1/trial-applications/apply
   */
  applyTrial = asyncHandler(async (req, res) => {
    const clientIp = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;

    const result = await trialApplicationService.submitApplication(
      req.body,
      clientIp,
      userAgent
    );

    if (result.refreshToken) {
      try {
        const { setRefreshTokenCookie } = require("../auth/auth.utils");
        setRefreshTokenCookie(res, result.refreshToken);
      } catch (_) {}
    }

    return SuccessResponse.send(res, result, StatusCodes.CREATED);
  });
}

module.exports = new TrialApplicationController();

