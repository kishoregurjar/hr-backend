const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { COOKIE_NAMES, AUTH_MESSAGES } = require("./auth.constants");
const authService = require("./auth.service");
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require("./auth.utils");
const { AuthDto } = require("./auth.dto");

/**
 * =====================================================
 * Enterprise Auth Controller
 * =====================================================
 * Pure HTTP Request/Response handling layer for Authentication.
 * Placed directly at module root matching 100% Zero-Subfolder Standard.
 * =====================================================
 */
class AuthController {
  register = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const result = await authService.register(payload);

    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken);
    }

    return SuccessResponse.send(
      res,
      {
        message: result.message || "User registered successfully.",
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      },
      StatusCodes.CREATED
    );
  });

  login = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const result = await authService.login(payload);

    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken);
    }

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Login successful.",
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      },
      StatusCodes.OK
    );
  });

  refreshToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN] || req.body?.refreshToken;
    const result = await authService.refreshAccessToken(incomingRefreshToken);

    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken);
    }

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Token refreshed successfully.",
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      },
      StatusCodes.OK
    );
  });

  logout = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN] || req.body?.refreshToken;
    const result = await authService.logout(incomingRefreshToken);

    clearRefreshTokenCookie(res);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Logged out successfully.",
      },
      StatusCodes.OK
    );
  });

  logoutAllDevices = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await authService.logoutAllDevices(userId);

    clearRefreshTokenCookie(res);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Logged out from all devices successfully.",
      },
      StatusCodes.OK
    );
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const result = await authService.forgotPassword(payload);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "If an account exists with that email, a password reset link has been sent.",
      },
      StatusCodes.OK
    );
  });

  resetPassword = asyncHandler(async (req, res) => {
    const payload = req.validatedData || req.body;
    const result = await authService.resetPassword(payload);

    clearRefreshTokenCookie(res);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Password reset successful.",
      },
      StatusCodes.OK
    );
  });

  changePassword = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const payload = req.validatedData || req.body;
    const result = await authService.changePassword(userId, payload);

    clearRefreshTokenCookie(res);

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Password changed successfully.",
      },
      StatusCodes.OK
    );
  });

  getCurrentUser = asyncHandler(async (req, res) => {
    return SuccessResponse.send(
      res,
      {
        message: AUTH_MESSAGES.CURRENT_USER_FETCHED || "User profile fetched successfully.",
        data: {
          user: AuthDto.toResponse(req.user),
        },
      },
      StatusCodes.OK
    );
  });
}

const authController = new AuthController();

module.exports = authController;
