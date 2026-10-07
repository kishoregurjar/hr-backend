"use strict";

const env = require("../../config/env");
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

    const clientUrl = env.frontend.url;
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

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        isSyncingNow: service.isSyncInProgress(user.id),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function syncMailboxNow(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    
    if (service.isSyncInProgress(user.id)) {
      const error = new Error("Mailbox sync is already in progress for your account. Please wait a moment.");
      error.code = "MAILBOX_SYNC_IN_PROGRESS";
      error.statusCode = 409;
      throw error;
    }

    let dateRangeOptions = null;
    const { fromDate, toDate } = req.body || {};
    
    if (fromDate || toDate) {
      if (!fromDate || !toDate) {
        const error = new Error("Both fromDate and toDate are required for a date range sync.");
        error.code = "INVALID_DATE_RANGE";
        error.statusCode = 400;
        throw error;
      }
      
      const from = new Date(fromDate);
      const to = new Date(toDate);
      
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        const error = new Error("Invalid date format provided.");
        error.code = "INVALID_DATE_FORMAT";
        error.statusCode = 400;
        throw error;
      }
      
      if (from > to) {
        const error = new Error("fromDate cannot be after toDate.");
        error.code = "INVALID_DATE_RANGE";
        error.statusCode = 400;
        throw error;
      }
      
      // Ensure To Date is inclusive (end of the calendar day)
      const toInclusive = new Date(to);
      toInclusive.setUTCHours(23, 59, 59, 999);

      // Check if To Date is in the future relative to now
      const isFutureDateSync = toInclusive.getTime() > Date.now();

      // Ensure we use the string format YYYY-MM-DD for Gmail query logic
      dateRangeOptions = {
        fromDate: from.toISOString().split("T")[0],
        toDate: to.toISOString().split("T")[0],
        isFutureDateSync,
        dateRangeSyncFrom: from,
        dateRangeSyncTo: toInclusive
      };
    }

    service.startBackgroundSync(user.id, dateRangeOptions);

    return res.status(202).json({
      success: true,
      code: "MAILBOX_SYNC_STARTED",
      message: "Mailbox sync started in background.",
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

async function stopAutomaticSync(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.stopAutomaticSync(user.id);

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
  stopAutomaticSync,
};
