"use strict";

const express = require("express");
const requireAuth = require("../../middleware/requireAuth");
const notificationController = require("./notification.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;

