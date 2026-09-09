"use strict";

require("./test-env");

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { prisma } = require("./test-db");

/**
 * Create a test user.
 */
async function createUser({
  email,
  name = "Test User",
  status = "ACTIVE",
  password = "Password@123",
} = {}) {
  const hashedPassword = password
    ? await bcrypt.hash(password, 10) // 10 rounds for test speed
    : null;

  return prisma.user.create({
    data: {
      email: email || `user-${crypto.randomUUID()}@example.com`,
      name,
      status,
      password: hashedPassword,
    },
  });
}

/**
 * Create a test company.
 */
async function createCompany({
  name,
  status = "ACTIVE",
} = {}) {
  const uniqueName = name || `Test Company ${crypto.randomUUID()}`;
  const slug = uniqueName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  return prisma.company.create({
    data: {
      name: uniqueName,
      slug: `${slug}-${crypto.randomBytes(4).toString("hex")}`,
      status,
    },
  });
}

/**
 * Create a company member.
 */
async function createCompanyMember({
  companyId,
  userId,
  role = "RECRUITER",
} = {}) {
  if (!companyId || !userId) {
    throw new Error("companyId and userId are required");
  }

  return prisma.companyMember.create({
    data: {
      companyId,
      userId,
      role,
    },
  });
}

/**
 * Create a company with an owner — the most common test fixture.
 */
async function createCompanyWithOwner({
  companyName,
  ownerEmail,
  ownerPassword = "Password@123",
} = {}) {
  const company = await createCompany({ name: companyName });

  const owner = await createUser({
    email: ownerEmail || `owner-${crypto.randomUUID()}@example.com`,
    password: ownerPassword,
  });

  const member = await createCompanyMember({
    companyId: company.id,
    userId: owner.id,
    role: "OWNER",
  });

  return { company, owner, member };
}

/**
 * Create a company invitation record directly in DB (bypasses service layer).
 */
async function createInvitation({
  companyId,
  email,
  role = "RECRUITER",
  status = "PENDING",
  tokenHash,
  encryptedToken = "encrypted-token-placeholder",
  expiresAt,
} = {}) {
  if (!companyId) throw new Error("companyId is required");

  return prisma.companyInvitation.create({
    data: {
      companyId,
      email: email || `invite-${crypto.randomUUID()}@example.com`,
      role,
      status,
      tokenHash: tokenHash || crypto.randomBytes(32).toString("hex"),
      encryptedToken,
      expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

module.exports = {
  createUser,
  createCompany,
  createCompanyMember,
  createCompanyWithOwner,
  createInvitation,
};
