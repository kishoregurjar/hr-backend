"use strict";

const service = require("./mailbox.service");

function getAuthenticatedUser(req) {
  if (!req.user || !req.user.id) {
    const error = new Error("Authentication required");
    error.code = "AUTHENTICATION_REQUIRED";
    error.statusCode = 401;
    throw error;
  }
  return req.user;
}

async function connectGoogleMailbox(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const authUrl = service.getAuthUrl(user.id);

    return res.status(200).json({
      success: true,
      data: {
        url: authUrl,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function handleGoogleCallback(req, res, next) {
  try {
    const code = req.query.code;
    const stateUserId = req.query.state;

    const userId = req.user?.id || stateUserId;

    if (!userId) {
      const error = new Error("User context required for callback");
      error.code = "USER_ID_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    const result = await service.handleCallback(code, userId);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    return res.redirect(
      `${clientUrl}/candidates?mailbox=connected&email=${encodeURIComponent(result.email)}`
    );
  } catch (error) {
    return next(error);
  }
}

async function getMailboxStatus(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const status = await service.getMailboxStatus(user.id);

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    return next(error);
  }
}

async function syncMailboxNow(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.syncMailboxForUser(user.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function disconnectMailbox(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.disconnectMailbox(user.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  connectGoogleMailbox,
  handleGoogleCallback,
  getMailboxStatus,
  syncMailboxNow,
  disconnectMailbox,
};
