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

const { runSerializableTransaction } = require("../../utils/prisma-transaction");

const findMemberForUpdate = async (companyId, memberId, tx = prisma) => {
  return tx.companyMember.findFirst({
    where: {
      id: memberId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      userId: true,
      role: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      },
    },
  });
};

const transferOwnership = async ({
  companyId,
  currentOwnerMemberId,
  targetMemberId,
}) => {
  return runSerializableTransaction(prisma, async (tx) => {
    const currentOwner = await tx.companyMember.findFirst({
      where: {
        id: currentOwnerMemberId,
        companyId,
        role: "OWNER",
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!currentOwner) {
      const error = new Error("COMPANY_OWNER_REQUIRED");
      error.statusCode = 409;
      error.code = "COMPANY_OWNER_REQUIRED";
      throw error;
    }

    const targetMember = await tx.companyMember.findFirst({
      where: {
        id: targetMemberId,
        companyId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!targetMember) {
      const error = new Error("COMPANY_OWNERSHIP_TRANSFER_TARGET_INVALID");
      error.statusCode = 404;
      error.code = "COMPANY_OWNERSHIP_TRANSFER_TARGET_INVALID";
      throw error;
    }

    if (targetMember.role === "OWNER") {
      const error = new Error("COMPANY_OWNERSHIP_TRANSFER_TARGET_INVALID");
      error.statusCode = 409;
      error.code = "COMPANY_OWNERSHIP_TRANSFER_TARGET_INVALID";
      throw error;
    }

    await tx.companyMember.update({
      where: {
        id: currentOwnerMemberId,
      },
      data: {
        role: targetMember.role,
      },
    });

    const newOwner = await tx.companyMember.update({
      where: {
        id: targetMemberId,
      },
      data: {
        role: "OWNER",
      },
      select: {
        id: true,
        companyId: true,
        userId: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    return newOwner;
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
  findMemberForUpdate,
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
  transferOwnership,

  findUserById,
  findUserByEmail,
  countCompanyJobs,
};

