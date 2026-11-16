"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const { TRIAL_APPLICATION_STATUS } = require("./trial-application.constants");

const DATA_DIR = path.resolve(__dirname, "../../../data");
const APPLICATIONS_FILE = path.join(DATA_DIR, "trial-applications.json");
const OTPS_FILE = path.join(DATA_DIR, "trial-application-otps.json");

// Ensure data directory exists
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readJsonFile = (filePath, fallback = []) => {
  try {
    ensureDataDir();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error(`[TrialApplicationStore] Failed to read ${filePath}:`, err.message);
    return fallback;
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`[TrialApplicationStore] Failed to write ${filePath}:`, err.message);
  }
};

class TrialApplicationStore {
  // â”€â”€â”€ OTP Storage Methods â”€â”€â”€

  async saveOtp({ email, otpHash, expiresAt }) {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // 1. Try Prisma first
    try {
      if (prisma.trialApplicationOtp) {
        return await prisma.trialApplicationOtp.upsert({
          where: { email: normalizedEmail },
          update: {
            otpHash,
            expiresAt,
            attempts: 0,
            lastSentAt: now,
          },
          create: {
            email: normalizedEmail,
            otpHash,
            expiresAt,
            attempts: 0,
            lastSentAt: now,
          },
        });
      }
    } catch (err) {
      // Table missing (P2021) or column missing (P2022) -> fallback to file store
    }

    // 2. File fallback
    const otps = readJsonFile(OTPS_FILE, []);
    const existingIndex = otps.findIndex((o) => o.email === normalizedEmail);
    const record = {
      id: existingIndex >= 0 ? otps[existingIndex].id : `otp_${crypto.randomUUID()}`,
      email: normalizedEmail,
      otpHash,
      attempts: 0,
      expiresAt: expiresAt.toISOString(),
      lastSentAt: now.toISOString(),
      createdAt: existingIndex >= 0 ? otps[existingIndex].createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (existingIndex >= 0) {
      otps[existingIndex] = record;
    } else {
      otps.push(record);
    }
    writeJsonFile(OTPS_FILE, otps);
    return record;
  }

  async findOtpByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Try Prisma first
    try {
      if (prisma.trialApplicationOtp) {
        const record = await prisma.trialApplicationOtp.findUnique({
          where: { email: normalizedEmail },
        });
        if (record) return record;
      }
    } catch (_) {}

    // 2. File fallback
    const otps = readJsonFile(OTPS_FILE, []);
    const record = otps.find((o) => o.email === normalizedEmail);
    if (!record) return null;

    return {
      ...record,
      expiresAt: new Date(record.expiresAt),
      lastSentAt: new Date(record.lastSentAt),
    };
  }

  async incrementOtpAttempts(email) {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      if (prisma.trialApplicationOtp) {
        return await prisma.trialApplicationOtp.update({
          where: { email: normalizedEmail },
          data: { attempts: { increment: 1 } },
        });
      }
    } catch (_) {}

    const otps = readJsonFile(OTPS_FILE, []);
    const record = otps.find((o) => o.email === normalizedEmail);
    if (record) {
      record.attempts = (record.attempts || 0) + 1;
      writeJsonFile(OTPS_FILE, otps);
      return record;
    }
    return null;
  }

  async deleteOtp(email) {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      if (prisma.trialApplicationOtp) {
        await prisma.trialApplicationOtp.deleteMany({
          where: { email: normalizedEmail },
        });
      }
    } catch (_) {}

    const otps = readJsonFile(OTPS_FILE, []);
    const filtered = otps.filter((o) => o.email !== normalizedEmail);
    writeJsonFile(OTPS_FILE, filtered);
  }

  // â”€â”€â”€ Application Storage Methods â”€â”€â”€

  async createApplication(data) {
    const record = {
      id: `app_${crypto.randomUUID()}`,
      companyName: data.companyName.trim(),
      ownerName: data.ownerName.trim(),
      businessEmail: data.businessEmail.toLowerCase().trim(),
      phone: data.phone?.trim() || null,
      website: data.website?.trim() || null,
      businessDescription: data.businessDescription?.trim() || null,
      industry: data.industry?.trim() || null,
      passwordHash: data.passwordHash,
      isBusinessEmail: Boolean(data.isBusinessEmail),
      emailVerified: true,
      emailVerifiedAt: new Date(),
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      status: TRIAL_APPLICATION_STATUS.PENDING_REVIEW,
      reviewerId: null,
      reviewedAt: null,
      rejectionReason: null,
      reviewNotes: null,
      approvedCompanyId: null,
      approvedCompanySlug: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1. Try Prisma first
    try {
      if (prisma.trialApplication) {
        const created = await prisma.trialApplication.create({
          data: {
            companyName: record.companyName,
            ownerName: record.ownerName,
            businessEmail: record.businessEmail,
            phone: record.phone,
            website: record.website,
            businessDescription: record.businessDescription,
            industry: record.industry,
            passwordHash: record.passwordHash,
            isBusinessEmail: record.isBusinessEmail,
            emailVerified: record.emailVerified,
            emailVerifiedAt: record.emailVerifiedAt,
            ipAddress: record.ipAddress,
            userAgent: record.userAgent,
            status: record.status,
          },
        });
        return created;
      }
    } catch (err) {
      console.warn("[TrialApplicationStore] Prisma create failed, falling back to JSON store:", err.message);
    }

    // 2. File fallback
    const apps = readJsonFile(APPLICATIONS_FILE, []);
    apps.unshift({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      emailVerifiedAt: record.emailVerifiedAt.toISOString(),
    });
    writeJsonFile(APPLICATIONS_FILE, apps);
    return record;
  }

  async findApplicationById(id) {
    let prismaApp = null;
    try {
      if (prisma.trialApplication) {
        prismaApp = await prisma.trialApplication.findUnique({ where: { id } });
      }
    } catch (_) {}

    const apps = readJsonFile(APPLICATIONS_FILE, []);
    const jsonApp = apps.find((a) => a.id === id);

    if (!prismaApp && !jsonApp) return null;

    const base = prismaApp || jsonApp;
    return {
      ...(jsonApp || {}),
      ...(prismaApp || {}),
      approvalEmailSent: jsonApp?.approvalEmailSent ?? prismaApp?.approvalEmailSent ?? false,
      approvalEmailSentAt: jsonApp?.approvalEmailSentAt ? new Date(jsonApp.approvalEmailSentAt) : (prismaApp?.approvalEmailSentAt || null),
      approvalEmailError: jsonApp?.approvalEmailError || prismaApp?.approvalEmailError || null,
      createdAt: new Date(base.createdAt),
      updatedAt: new Date(base.updatedAt),
      reviewedAt: base.reviewedAt ? new Date(base.reviewedAt) : null,
      emailVerifiedAt: base.emailVerifiedAt ? new Date(base.emailVerifiedAt) : null,
    };
  }

  async findApplicationByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      if (prisma.trialApplication) {
        const app = await prisma.trialApplication.findFirst({
          where: { businessEmail: normalizedEmail },
          orderBy: { createdAt: "desc" },
        });
        if (app) return app;
      }
    } catch (_) {}

    const apps = readJsonFile(APPLICATIONS_FILE, []);
    const app = apps.find((a) => a.businessEmail === normalizedEmail);
    if (!app) return null;

    return {
      ...app,
      createdAt: new Date(app.createdAt),
      updatedAt: new Date(app.updatedAt),
      reviewedAt: app.reviewedAt ? new Date(app.reviewedAt) : null,
    };
  }

  async findPendingByEmailOrCompany(email, companyName) {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCompany = companyName.toLowerCase().trim();

    try {
      if (prisma.trialApplication) {
        const app = await prisma.trialApplication.findFirst({
          where: {
            status: TRIAL_APPLICATION_STATUS.PENDING_REVIEW,
            OR: [
              { businessEmail: normalizedEmail },
              { companyName: { equals: normalizedCompany, mode: "insensitive" } },
            ],
          },
        });
        if (app) return app;
      }
    } catch (_) {}

    const apps = readJsonFile(APPLICATIONS_FILE, []);
    const app = apps.find(
      (a) =>
        a.status === TRIAL_APPLICATION_STATUS.PENDING_REVIEW &&
        (a.businessEmail === normalizedEmail || a.companyName.toLowerCase().trim() === normalizedCompany)
    );
    return app || null;
  }

  async listApplications({ page = 1, limit = 20, status = "ALL", search = "" }) {
    const normalizedPage = Math.max(Number(page) || 1, 1);
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    // 1. Try Prisma first
    try {
      if (prisma.trialApplication) {
        const where = {};
        if (status && status !== "ALL") {
          where.status = status;
        }
        if (search && search.trim()) {
          const s = search.trim();
          where.OR = [
            { companyName: { contains: s, mode: "insensitive" } },
            { ownerName: { contains: s, mode: "insensitive" } },
            { businessEmail: { contains: s, mode: "insensitive" } },
            { phone: { contains: s, mode: "insensitive" } },
          ];
        }

        const [items, total] = await Promise.all([
          prisma.trialApplication.findMany({
            where,
            skip,
            take: normalizedLimit,
            orderBy: { createdAt: "desc" },
          }),
          prisma.trialApplication.count({ where }),
        ]);

        return {
          items,
          total,
          page: normalizedPage,
          limit: normalizedLimit,
          totalPages: Math.ceil(total / normalizedLimit),
        };
      }
    } catch (err) {
      console.warn("[TrialApplicationStore] Prisma list failed, using JSON store:", err.message);
    }

    // 2. File fallback
    const apps = readJsonFile(APPLICATIONS_FILE, []);
    let filtered = [...apps];

    if (status && status !== "ALL") {
      filtered = filtered.filter((a) => a.status === status);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.companyName.toLowerCase().includes(q) ||
          a.ownerName.toLowerCase().includes(q) ||
          a.businessEmail.toLowerCase().includes(q) ||
          (a.phone && a.phone.includes(q))
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + normalizedLimit).map((a) => ({
      ...a,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
      reviewedAt: a.reviewedAt ? new Date(a.reviewedAt) : null,
    }));

    return {
      items: paginated,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async updateApplication(id, updates) {
    const now = new Date();
    let updatedPrisma = null;

    try {
      if (prisma.trialApplication) {
        const allowedPrismaFields = [
          "companyName", "ownerName", "businessEmail", "phone", "website",
          "businessDescription", "industry", "passwordHash", "isBusinessEmail",
          "emailVerified", "emailVerifiedAt", "ipAddress", "userAgent",
          "status", "reviewerId", "reviewedAt", "rejectionReason", "reviewNotes",
          "approvedCompanyId", "approvedCompanySlug"
        ];
        const prismaData = {};
        for (const [k, v] of Object.entries(updates)) {
          if (allowedPrismaFields.includes(k)) {
            prismaData[k] = v;
          }
        }
        updatedPrisma = await prisma.trialApplication.update({
          where: { id },
          data: {
            ...prismaData,
            updatedAt: now,
          },
        });
      }
    } catch (err) {
      console.warn("[TrialApplicationStore] Prisma update warning:", err.message);
    }

    try {
      const apps = readJsonFile(APPLICATIONS_FILE, []);
      const index = apps.findIndex((a) => a.id === id);
      if (index >= 0) {
        apps[index] = {
          ...apps[index],
          ...updates,
          updatedAt: now.toISOString(),
        };
        writeJsonFile(APPLICATIONS_FILE, apps);
        return {
          ...(updatedPrisma || {}),
          ...apps[index],
        };
      } else if (updatedPrisma) {
        apps.push({
          ...updatedPrisma,
          ...updates,
          updatedAt: now.toISOString(),
        });
        writeJsonFile(APPLICATIONS_FILE, apps);
      }
    } catch (_) {}

    return updatedPrisma;
  }
}

module.exports = new TrialApplicationStore();

