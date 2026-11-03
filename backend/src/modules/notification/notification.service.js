"use strict";

const notificationRepository = require("./notification.repository");
const { NOTIFICATION_CACHE } = require("./notification.constants");
const { redisClient } = require("../../config/redis");
const socketService = require("../../socket/socket.service");
const logger = require("../../config/logger");

class NotificationService {
  /**
   * Helper to invalidate Redis unread count cache
   */
  async invalidateUnreadCache(userId) {
    if (!userId || !redisClient?.isOpen) return;
    try {
      await redisClient.del(NOTIFICATION_CACHE.UNREAD_COUNT_KEY(userId));
    } catch (err) {
      logger.warn(`Failed to invalidate notification cache for user ${userId}:`, err?.message);
    }
  }

  /**
   * Get paginated notifications for the authenticated user / company
   */
  async getNotifications(userId, companyId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let isRead = undefined;
    if (query.isRead === "true" || query.isRead === true) isRead = true;
    if (query.isRead === "false" || query.isRead === false) isRead = false;

    const { items, total } = await notificationRepository.findByUser({
      userId,
      companyId,
      isRead,
      limit,
      offset,
    });

    return {
      notifications: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get unread count with Redis caching to protect Supabase DB from high query load
   */
  async getUnreadCount(userId, companyId) {
    const cacheKey = userId ? NOTIFICATION_CACHE.UNREAD_COUNT_KEY(userId) : null;

    if (cacheKey && redisClient?.isOpen) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          return { unreadCount: parseInt(cached, 10) || 0 };
        }
      } catch (err) {
        logger.warn("Redis notification cache read failed, falling back to DB:", err?.message);
      }
    }

    const count = await notificationRepository.countUnread({ userId, companyId });

    if (cacheKey && redisClient?.isOpen) {
      try {
        await redisClient.set(cacheKey, String(count), {
          EX: NOTIFICATION_CACHE.TTL_SECONDS,
        });
      } catch (err) {
        logger.warn("Redis notification cache write failed:", err?.message);
      }
    }

    return { unreadCount: count };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id, userId, companyId) {
    await notificationRepository.markAsRead(id, { userId, companyId });
    await this.invalidateUnreadCache(userId);

    const { unreadCount } = await this.getUnreadCount(userId, companyId);
    return { id, isRead: true, unreadCount };
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId, companyId) {
    await notificationRepository.markAllAsRead({ userId, companyId });

    if (userId && redisClient?.isOpen) {
      try {
        await redisClient.set(NOTIFICATION_CACHE.UNREAD_COUNT_KEY(userId), "0", {
          EX: NOTIFICATION_CACHE.TTL_SECONDS,
        });
      } catch {}
    }

    return { message: "All notifications marked as read.", unreadCount: 0 };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(id, userId, companyId) {
    await notificationRepository.delete(id, { userId, companyId });
    await this.invalidateUnreadCache(userId);

    const { unreadCount } = await this.getUnreadCount(userId, companyId);
    return { id, deleted: true, unreadCount };
  }

  /**
   * Clear all notifications for user/company
   */
  async clearAllNotifications(userId, companyId) {
    const result = await notificationRepository.deleteAll({ userId, companyId });
    await this.invalidateUnreadCache(userId);

    return { cleared: true, count: result.count, unreadCount: 0 };
  }

  /**
   * Production Core Method: Create notification record and broadcast via Socket.IO
   */
  async createAndSendNotification({
    userId = null,
    companyId = null,
    title,
    message,
    type = "SYSTEM",
    priority = "MEDIUM",
    link = null,
    metadata = null,
  }) {
    if (!title || !message) {
      logger.warn("Cannot create notification: title and message are required.");
      return null;
    }

    try {
      const notification = await notificationRepository.create({
        userId,
        companyId,
        title,
        message,
        type,
        priority,
        link,
        metadata,
      });

      // Invalidate cache
      if (userId) {
        await this.invalidateUnreadCache(userId);
      }

      // Real-time broadcast via Socket.IO
      const payload = {
        notification,
        timestamp: new Date().toISOString(),
      };

      if (userId) {
        socketService.emitToRoom(`user:${userId}`, "NEW_NOTIFICATION", payload);
      }
      if (companyId) {
        socketService.emitToCompany(companyId, "NEW_NOTIFICATION", payload);
      }
      socketService.emitGlobalHR("NEW_NOTIFICATION", payload);

      logger.info(`Notification sent: "${title}" [${type}] to ${userId ? `User:${userId}` : `Company:${companyId}`}`);
      return notification;
    } catch (err) {
      logger.error("Failed to create and dispatch notification:", err);
      return null;
    }
  }
}

module.exports = new NotificationService();

