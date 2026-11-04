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

const findCompanyBySlug = async (slugOrDomain, tx = prisma) => {
  if (!slugOrDomain || typeof slugOrDomain !== "string") return null;
  const cleanTerm = slugOrDomain.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Lookup by company slug
  const comp = await tx.company.findUnique({
    where: {
      slug: cleanTerm,
    },
  });
  if (comp) return comp;

  // 2. Lookup by exact customDomain
  const domainComp = await tx.company.findFirst({
    where: {
      customDomain: {
        equals: cleanTerm,
        mode: "insensitive",
      },
    },
  });

  if (domainComp) {
    // In production, unverified custom domains cannot be resolved by custom domain
    if (isProduction && domainComp.customDomainVerified !== true) {
      return null;
    }
    return domainComp;
  }

  // 3. Local Development Simulation:
  // e.g. "facebookcompany" matching "facebookcompany.com" from "facebookcompany.localhost:3000"
  if (!isProduction && !cleanTerm.includes(".")) {
    const simComp = await tx.company.findFirst({
      where: {
        customDomain: {
          startsWith: `${cleanTerm}.`,
          mode: "insensitive",
        },
      },
    });
    if (simComp) return simComp;
  }

  return null;
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

const updateUserStatus = async (userId, status, tx = prisma) => {
  return tx.user.update({
    where: { id: userId },
    data: { status },
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
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          avatarUrl: true,
        },
      },
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

const findDefaultCompanyContextForUser = async (userId, tx = prisma) => {
  return tx.company.findFirst({
    where: {
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
      status: true,
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
      status: true,
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
          avatarUrl: true,
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
          avatarUrl: true,
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
  findDefaultCompanyContextForUser,

  countOwners,
  transferOwnership,

  findUserById,
  findUserByEmail,
  countCompanyJobs,
  updateUserStatus,
};

