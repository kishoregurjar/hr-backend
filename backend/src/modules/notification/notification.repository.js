"use strict";

const { prisma } = require("../../config/prisma");

class NotificationRepository {
  /**
   * Create a new notification record in the database
   */
  async create(data) {
    return prisma.notification.create({
      data: {
        userId: data.userId || null,
        companyId: data.companyId || null,
        title: data.title,
        message: data.message,
        type: data.type || "SYSTEM",
        priority: data.priority || "MEDIUM",
        link: data.link || null,
        metadata: data.metadata || null,
        isRead: false,
      },
    });
  }

  /**
   * Find notifications for a specific user and/or company with pagination
   */
  async findByUser({ userId, companyId, isRead, limit = 20, offset = 0 }) {
    const whereClause = {
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(companyId ? [{ companyId, userId: null }] : []),
      ],
    };

    if (typeof isRead === "boolean") {
      whereClause.isRead = isRead;
    }

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({
        where: whereClause,
      }),
    ]);

    return { items, total };
  }

  /**
   * Count unread notifications
   */
  async countUnread({ userId, companyId }) {
    const whereClause = {
      isRead: false,
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(companyId ? [{ companyId, userId: null }] : []),
      ],
    };

    return prisma.notification.count({ where: whereClause });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id, { userId, companyId }) {
    return prisma.notification.updateMany({
      where: {
        id,
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(companyId ? [{ companyId }] : []),
        ],
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead({ userId, companyId }) {
    const whereClause = {
      isRead: false,
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(companyId ? [{ companyId, userId: null }] : []),
      ],
    };

    return prisma.notification.updateMany({
      where: whereClause,
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Delete a notification
   */
  async delete(id, { userId, companyId }) {
    return prisma.notification.deleteMany({
      where: {
        id,
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(companyId ? [{ companyId }] : []),
        ],
      },
    });
  }

  /**
   * Prune read notifications older than X days to prevent DB bloat
   */
  async pruneOld(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });
  }
}

module.exports = new NotificationRepository();
