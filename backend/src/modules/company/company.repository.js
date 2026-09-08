"use strict";

const { prisma } = require("../../config/prisma");

const createCompany = async (data, tx = prisma) => {
  return tx.company.create({
    data,
  });
};

const findCompanyById = async (companyId, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      id: companyId,
    },
  });
};

const findCompanyBySlug = async (slug, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      slug,
    },
  });
};

const updateCompanyById = async (companyId, data, tx = prisma) => {
  return tx.company.update({
    where: {
      id: companyId,
    },
    data,
  });
};

const deleteCompanyById = async (companyId, tx = prisma) => {
  return tx.company.delete({
    where: {
      id: companyId,
    },
  });
};

const findMember = async (companyId, userId, tx = prisma) => {
  return tx.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId,
        userId,
      },
    },
  });
};

const findMemberById = async (memberId, tx = prisma) => {
  return tx.companyMember.findUnique({
    where: {
      id: memberId,
    },
  });
};

const findMemberByIdForUpdate = async (memberId, tx = prisma) => {
  return tx.companyMember.findUnique({
    where: {
      id: memberId,
    },
  });
};


const findMemberByIdWithCompany = async (memberId, tx = prisma) => {
  return tx.companyMember.findUnique({
    where: {
      id: memberId,
    },
    include: {
      company: true,
    },
  });
};


const createMember = async (data, tx = prisma) => {
  return tx.companyMember.create({
    data,
  });
};

const updateMemberRole = async (memberId, role, tx = prisma) => {
  return tx.companyMember.update({
    where: {
      id: memberId,
    },
    data: {
      role,
    },
  });
};

const deleteMember = async (memberId, tx = prisma) => {
  return tx.companyMember.delete({
    where: {
      id: memberId,
    },
  });
};

const findCompanyMembers = async (
  companyId,
  {
    skip = 0,
    take = 20,
  } = {},
  tx = prisma
) => {
  return tx.companyMember.findMany({
    where: {
      companyId,
    },
    orderBy: {
      createdAt: "asc",
    },
    skip,
    take,
  });
};

const countCompanyMembers = async (companyId, tx = prisma) => {
  return tx.companyMember.count({
    where: {
      companyId,
    },
  });
};

const findCompanyWithMembers = async (companyId, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      members: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
};

const findCompanyWithMember = async (companyId, userId, tx = prisma) => {
  return tx.company.findFirst({
    where: {
      id: companyId,
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      members: {
        where: {
          userId,
        },
        take: 1,
      },
    },
  });
};

const findCompanyByMemberUserId = async (userId, tx = prisma) => {
  return tx.company.findFirst({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
  });
};

const countOwners = async (companyId, tx = prisma) => {
  return tx.companyMember.count({
    where: {
      companyId,
      role: "OWNER",
    },
  });
};

const findUserById = async (userId, tx = prisma) => {
  return tx.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
    },
  });
};

const findUserByEmail = async (email, tx = prisma) => {
  return tx.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
    },
  });
};

const countCompanyJobs = async (companyId, tx = prisma) => {
  return tx.job.count({
    where: {
      companyId,
    },
  });
};

module.exports = {
  createCompany,
  findCompanyById,
  findCompanyBySlug,
  updateCompanyById,
  deleteCompanyById,

  findMember,
  findMemberById,
  findMemberByIdForUpdate,
  findMemberByIdWithCompany,
  createMember,
  updateMemberRole,
  deleteMember,

  findCompanyMembers,
  countCompanyMembers,

  findCompanyWithMembers,
  findCompanyWithMember,
  findCompanyContext: findCompanyWithMember,
  findCompanyByMemberUserId,

  countOwners,

  findUserById,
  findUserByEmail,
  countCompanyJobs,
};

