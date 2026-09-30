"use strict";

const { prisma } = require("../../config/prisma");

class PublicContactRepository {
  createInquiry(data, tx = prisma) {
    return tx.publicContactInquiry.create({
      data,
    });
  }

  findRecentDuplicate(email, subject, timeWindowSeconds = 60, tx = prisma) {
    const timeLimit = new Date(Date.now() - timeWindowSeconds * 1000);
    return tx.publicContactInquiry.findFirst({
      where: {
        email,
        subject,
        createdAt: {
          gte: timeLimit,
        },
      },
    });
  }

  getInquiryById(id, tx = prisma) {
    return tx.publicContactInquiry.findUnique({
      where: { id },
    });
  }

  findManyInquiries({ skip, take, status, sortField, sortOrder }, tx = prisma) {
    const where = {};
    if (status) where.status = status;

    return tx.publicContactInquiry.findMany({
      where,
      skip,
      take,
      orderBy: { [sortField]: sortOrder },
    });
  }

  countInquiries({ status }, tx = prisma) {
    const where = {};
    if (status) where.status = status;

    return tx.publicContactInquiry.count({
      where,
    });
  }

  updateInquiryStatus(id, status, tx = prisma) {
    return tx.publicContactInquiry.update({
      where: { id },
      data: { status },
    });
  }

  addReply(id, reply, adminId, tx = prisma) {
    return tx.publicContactInquiry.update({
      where: { id },
      data: {
        adminReply: reply,
        repliedAt: new Date(),
        repliedById: adminId,
        status: "RESOLVED",
      },
    });
  }
}

module.exports = new PublicContactRepository();
