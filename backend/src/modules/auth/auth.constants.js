/**
 * ============================================================
 * Auth Module Constants
 * ============================================================
 * Centralized constants for Authentication & Authorization.
 * Do not hardcode auth-related values anywhere else.
 * ============================================================
 */

const AUTH_ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  HR: "HR",
  CANDIDATE: "CANDIDATE",
});

const TOKEN_TYPES = Object.freeze({
  ACCESS: "ACCESS",
  REFRESH: "REFRESH",
});

const TOKEN_EXPIRATION = Object.freeze({
  ACCESS_TOKEN: "7d",
  REFRESH_TOKEN: "30d",
  PASSWORD_RESET: "15m",
  EMAIL_VERIFICATION: "24h",
});

const COOKIE_NAMES = Object.freeze({
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
});

const AUTH_MESSAGES = Object.freeze({
  REGISTER_SUCCESS: "User registered successfully.",
  LOGIN_SUCCESS: "Login successful.",
  LOGOUT_SUCCESS: "Logout successful.",
  LOGOUT_ALL_SUCCESS: "Logged out from all devices successfully.",

  TOKEN_REFRESHED: "Access token refreshed successfully.",

  PASSWORD_CHANGED: "Password changed successfully.",
  PASSWORD_CHANGED_SUCCESS: "Password changed successfully.",
  PASSWORD_RESET_EMAIL_SENT:
    "If the email is registered, password reset instructions have been sent.",
  PASSWORD_RESET_SUCCESS: "Password reset successfully.",

  EMAIL_VERIFIED: "Email verified successfully.",

  PROFILE_FETCHED: "Profile fetched successfully.",
  CURRENT_USER_FETCHED: "Current user fetched successfully.",
});

const AUTH_ERRORS = Object.freeze({
  INVALID_CREDENTIALS: "Invalid email or password.",
  INVALID_TOKEN: "Invalid token.",
  INVALID_ACCESS_TOKEN: "Invalid access token.",
  INVALID_REFRESH_TOKEN: "Invalid refresh token.",
  MALFORMED_TOKEN: "Malformed authentication token.",
  TOKEN_EXPIRED: "Token has expired.",
  TOKEN_REQUIRED: "Authentication token is required.",

  ACCESS_DENIED: "Access denied.",
  FORBIDDEN: "You are not authorized to perform this action.",

  ACCOUNT_DISABLED: "Your account has been disabled.",
  ACCOUNT_NOT_FOUND: "User account not found.",

  EMAIL_ALREADY_EXISTS: "Email already exists.",

  INVALID_PASSWORD: "Incorrect password.",
  INVALID_PASSWORD_FORMAT:
    "Password must contain at least one uppercase letter, one lowercase letter, one number, one special character and be between 8 to 64 characters long.",

  REFRESH_TOKEN_NOT_FOUND: "Refresh token not found.",

  PASSWORD_RESET_TOKEN_INVALID: "Password reset token is invalid.",
  INVALID_RESET_TOKEN: "Invalid or expired password reset token.",

  PASSWORD_ALREADY_USED: "New password must be different from current password.",

  EMAIL_NOT_VERIFIED: "Email is not verified.",
});

module.exports = Object.freeze({
  AUTH_ROLES,
  TOKEN_TYPES,
  TOKEN_EXPIRATION,
  COOKIE_NAMES,
  AUTH_MESSAGES,
  AUTH_ERRORS,
});
