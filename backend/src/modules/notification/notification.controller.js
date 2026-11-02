"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const notificationService = require("./notification.service");

/**
 * Extract authenticated user context and company membership without extra DB calls
 */
const getAuthContext = (req) => {
  const userId = req.user?.id || null;
  const companyId =
    req.user?.companyId ||
    req.headers["x-company-id"] ||
    req.headers["X-Company-Id"] ||
    req.user?.companyMembers?.[0]?.companyId ||
    req.companyId ||
    null;

  return { userId, companyId };
};

class NotificationController {
  getNotifications = asyncHandler(async (req, res) => {
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.getNotifications(
      userId,
      companyId,
      req.query
    );

    return SuccessResponse.send(
      res,
      {
        message: "Notifications retrieved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.getUnreadCount(userId, companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Unread count retrieved successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.markAsRead(id, userId, companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Notification marked as read.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  markAllAsRead = asyncHandler(async (req, res) => {
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.markAllAsRead(userId, companyId);

    return SuccessResponse.send(
      res,
      {
        message: result.message,
        data: result,
      },
      StatusCodes.OK
    );
  });

  deleteNotification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.deleteNotification(id, userId, companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Notification deleted.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  clearAllNotifications = asyncHandler(async (req, res) => {
    const { userId, companyId } = getAuthContext(req);

    const result = await notificationService.clearAllNotifications(userId, companyId);

    return SuccessResponse.send(
      res,
      {
        message: "All notifications cleared successfully.",
        data: result,
      },
      StatusCodes.OK
    );
  });
}

module.exports = new NotificationController();
