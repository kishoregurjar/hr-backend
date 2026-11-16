"use strict";

const { prisma } = require("../../config/prisma");

const findCompanyByName = async (name, tx = prisma) => {
  return tx.company.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
};

const findCompanyBySlug = async (slug, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
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
      role: true,
    },
  });
};

const createCompany = async (data, tx = prisma) => {
  return tx.company.create({
    data,
  });
};

const createCompanyOwner = async (data, tx = prisma) => {
  return tx.companyMember.create({
    data,
  });
};

const createUser = async (data, tx = prisma) => {
  return tx.user.create({
    data,
  });
};

const findCompanyOwner = async (companyId, tx = prisma) => {
  return tx.companyMember.findFirst({
    where: {
      companyId,
      role: "OWNER",
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          customDomain: true,
          customDomainVerified: true,
        },
      },
    },
  });
};

const findCompanies = async ({ where, skip, take, orderBy }, tx = prisma) => {
  let companies = [];
  let total = 0;

  try {
    const [c, t] = await Promise.all([
      tx.company.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          name: true,
          slug: true,
          customDomain: true,
          customDomainVerified: true,
          status: true,
          plan: true,
          planStatus: true,
          planStartedAt: true,
          planExpiresAt: true,
          customSeatLimit: true,
          customCandidateLimit: true,
          customInviteLimit: true,
          logoUrl: true,
          industry: true,
          email: true,
          city: true,
          country: true,
          createdAt: true,
          updatedAt: true,
          members: {
            where: { role: "OWNER" },
            select: {
              id: true,
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
          },
          _count: {
            select: {
              members: true,
              jobs: true,
            },
          },
        },
      }),
      tx.company.count({ where }),
    ]);
    companies = c;
    total = t;
  } catch (err) {
    const [c, t] = await Promise.all([
      tx.company.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          name: true,
          slug: true,
          customDomain: true,
          customDomainVerified: true,
          status: true,
          logoUrl: true,
          industry: true,
          email: true,
          city: true,
          country: true,
          createdAt: true,
          updatedAt: true,
          members: {
            where: { role: "OWNER" },
            select: {
              id: true,
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
          },
          _count: {
            select: {
              members: true,
              jobs: true,
            },
          },
        },
      }),
      tx.company.count({ where }),
    ]);

    companies = c.map((comp) => ({
      ...comp,
      plan: comp.plan || "STARTER",
      planStatus: comp.planStatus || "ACTIVE",
      planStartedAt: comp.planStartedAt || comp.createdAt,
      planExpiresAt: comp.planExpiresAt || null,
      customSeatLimit: comp.customSeatLimit || null,
      customCandidateLimit: comp.customCandidateLimit || null,
      customInviteLimit: comp.customInviteLimit || null,
    }));
    total = t;
  }

  return { companies, total };
};

const findCompanyById = async (companyId, tx = prisma) => {
  try {
    return await tx.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        planStatus: true,
        planStartedAt: true,
        planExpiresAt: true,
        customSeatLimit: true,
        customCandidateLimit: true,
        customInviteLimit: true,
        logoUrl: true,
        website: true,
        industry: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        invitations: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          members: true,
          jobs: true,
          invitations: true,
        },
      },
    },
  });
  } catch (err) {
    const comp = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logoUrl: true,
        website: true,
        industry: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        country: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        invitations: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            members: true,
            jobs: true,
            invitations: true,
          },
        },
      },
    });

    if (!comp) return null;
    return {
      ...comp,
      plan: comp.plan || "STARTER",
      planStatus: comp.planStatus || "ACTIVE",
      planStartedAt: comp.planStartedAt || comp.createdAt,
      planExpiresAt: comp.planExpiresAt || null,
      customSeatLimit: comp.customSeatLimit || null,
      customCandidateLimit: comp.customCandidateLimit || null,
      customInviteLimit: comp.customInviteLimit || null,
    };
  }
};

const updateCompanyStatus = async (companyId, status, tx = prisma) => {
  return tx.company.update({
    where: { id: companyId },
    data: { status },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      updatedAt: true,
    },
  });
};

module.exports = {
  findCompanyByName,
  findCompanyBySlug,
  findUserByEmail,
  findCompanyOwner,
  createCompany,
  createCompanyOwner,
  createUser,
  findCompanies,
  findCompanyById,
  updateCompanyStatus,
};
