"use strict";

const { prisma } = require("../../config/prisma");

/**
 * Find users with pagination, filtering, and company relation
 */
const findUsers = async ({ where, skip, take, orderBy }, tx = prisma) => {
  const [users, total] = await Promise.all([
    tx.user.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        companyMembers: {
          select: {
            id: true,
            role: true,
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    }),
    tx.user.count({ where }),
  ]);

  return { users, total };
};

/**
 * Find a single user by ID
 */
const findUserById = async (userId, tx = prisma) => {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      companyMembers: {
        select: {
          id: true,
          role: true,
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Find a single user by Email
 */
const findUserByEmail = async (email, tx = prisma) => {
  return tx.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

/**
 * Create a new user
 */
const createUser = async (data, tx = prisma) => {
  return tx.user.create({
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

/**
 * Update user role
 */
const updateUserRole = async (userId, role, tx = prisma) => {
  return tx.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });
};

/**
 * Update user status
 */
const updateUserStatus = async (userId, status, tx = prisma) => {
  return tx.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });
};

module.exports = {
  findUsers,
  findUserById,
  findUserByEmail,
  createUser,
  updateUserRole,
  updateUserStatus,
};
