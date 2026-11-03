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
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    if (conditions.length === 0) {
      return { items: [], total: 0 };
    }

    const whereClause = {
      OR: conditions,
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
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    if (conditions.length === 0) {
      return 0;
    }

    const whereClause = {
      isRead: false,
      OR: conditions,
    };

    return prisma.notification.count({ where: whereClause });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id, { userId, companyId }) {
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    return prisma.notification.updateMany({
      where: {
        id,
        ...(conditions.length > 0 ? { OR: conditions } : {}),
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user / company
   */
  async markAllAsRead({ userId, companyId }) {
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    if (conditions.length === 0) return { count: 0 };

    return prisma.notification.updateMany({
      where: {
        isRead: false,
        OR: conditions,
      },
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
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    return prisma.notification.deleteMany({
      where: {
        id,
        ...(conditions.length > 0 ? { OR: conditions } : {}),
      },
    });
  }

  /**
   * Delete all notifications for user or company
   */
  async deleteAll({ userId, companyId }) {
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (companyId) conditions.push({ companyId });

    if (conditions.length === 0) {
      return { count: 0 };
    }

    return prisma.notification.deleteMany({
      where: {
        OR: conditions,
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
