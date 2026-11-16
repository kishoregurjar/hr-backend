"use strict";

const crypto = require("node:crypto");
const { prisma } = require("../../config/prisma");
const { AppError } = require("../../utils/app-error");
const { hashPassword } = require("../auth/auth.utils");
const { buildCompanyTenantUrl } = require("../../utils/tenant-url");
const { sendEmail } = require("../../utils/email");
const auditService = require("../company/company.audit.service");

const {
  TRIAL_APPLICATION_STATUS,
  OTP_CONFIG,
  TRIAL_LIMITS,
} = require("./trial-application.constants");

const {
  isDisposableEmail,
  isBusinessDomain,
  sendOtpSchema,
  applyTrialSchema,
} = require("./trial-application.validator");

const trialApplicationStore = require("./trial-application.store");
const {
  buildTrialOtpEmail,
  buildTrialApprovalEmail,
  buildTrialRejectionEmail,
} = require("./trial-application.email.templates");

// In-memory concurrency locks to prevent race conditions during approval and email dispatch
const approvalLocks = new Set();

/**
 * Hash an OTP string with SHA-256
 */
const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
};

/**
 * Generate a slug from company name
 */
const generateSlugBase = (name) => {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `company-${crypto.randomBytes(3).toString("hex")}`
  );
};

const generateUniqueSlug = async (name, tx = prisma) => {
  const baseSlug = generateSlugBase(name);
  let slug = baseSlug;
  const existing = await tx.company.findUnique({ where: { slug: baseSlug } });
  if (existing) {
    slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
  }
  return slug;
};

class TrialApplicationService {
  /**
   * 1. Public Visitor: Send Email Verification OTP
   */
  async sendOtp({ email, ipAddress }) {
    const validated = sendOtpSchema.parse({ email });
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Check if disposable
    if (isDisposableEmail(normalizedEmail)) {
      throw new AppError("Temporary or disposable email domains are not permitted.", {
        statusCode: 400,
        code: "DISPOSABLE_EMAIL_REJECTED",
        isOperational: true,
      });
    }

    // Check if an existing user already has this email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new AppError("An account with this email is already registered. Please sign in.", {
        statusCode: 409,
        code: "EMAIL_ALREADY_REGISTERED",
        isOperational: true,
      });
    }

    // Check cooldown from last sent OTP
    const existingOtp = await trialApplicationStore.findOtpByEmail(normalizedEmail);
    if (existingOtp && existingOtp.lastSentAt) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(existingOtp.lastSentAt).getTime()) / 1000);
      if (elapsedSeconds < OTP_CONFIG.COOLDOWN_SECONDS) {
        const remaining = OTP_CONFIG.COOLDOWN_SECONDS - elapsedSeconds;
        throw new AppError(`Please wait ${remaining} seconds before requesting another verification code.`, {
          statusCode: 429,
          code: "OTP_RESEND_COOLDOWN",
          isOperational: true,
        });
      }
    }

    // Generate 6-digit numeric OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

    // Save hashed OTP
    await trialApplicationStore.saveOtp({
      email: normalizedEmail,
      otpHash,
      expiresAt,
    });

    // Send email using HireQuest email service
    try {
      const emailContent = buildTrialOtpEmail({
        otp: rawOtp,
        recipientEmail: normalizedEmail,
      });
      await sendEmail({
        to: normalizedEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (mailErr) {
      console.error("[TrialApplication] Failed to dispatch OTP email:", mailErr.message);
      // We still return success in development simulation if SMTP fails
      if (process.env.NODE_ENV === "production") {
        throw new AppError("Failed to deliver verification email. Please check your email address and try again.", {
          statusCode: 500,
          code: "EMAIL_DELIVERY_FAILED",
          isOperational: true,
        });
      }
    }

    return {
      message: `A 6-digit verification code has been dispatched to ${normalizedEmail}.`,
      cooldownSeconds: OTP_CONFIG.COOLDOWN_SECONDS,
      expiresInMinutes: OTP_CONFIG.EXPIRY_MINUTES,
    };
  }

  /**
   * 2. Public Visitor: Submit Demo Trial Application
   */
  async submitApplication(payload, clientIp = null, userAgent = null) {
    const validated = applyTrialSchema.parse(payload);
    const normalizedEmail = validated.businessEmail.toLowerCase().trim();
    const normalizedCompanyName = validated.companyName.trim();

    // 1. Verify OTP
    const otpRecord = await trialApplicationStore.findOtpByEmail(normalizedEmail);
    if (!otpRecord) {
      throw new AppError("Verification code not found or expired. Please request a new code.", {
        statusCode: 400,
        code: "OTP_NOT_FOUND",
        isOperational: true,
      });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      await trialApplicationStore.deleteOtp(normalizedEmail);
      throw new AppError("Verification code has expired. Please request a fresh code.", {
        statusCode: 400,
        code: "OTP_EXPIRED",
        isOperational: true,
      });
    }

    if ((otpRecord.attempts || 0) >= OTP_CONFIG.MAX_ATTEMPTS) {
      await trialApplicationStore.deleteOtp(normalizedEmail);
      throw new AppError("Maximum verification attempts exceeded. Please request a new code.", {
        statusCode: 429,
        code: "OTP_MAX_ATTEMPTS_EXCEEDED",
        isOperational: true,
      });
    }

    const submittedHash = hashOtp(validated.otp);
    if (submittedHash !== otpRecord.otpHash) {
      await trialApplicationStore.incrementOtpAttempts(normalizedEmail);
      throw new AppError("Invalid verification code. Please check and try again.", {
        statusCode: 400,
        code: "INVALID_OTP",
        isOperational: true,
      });
    }

    // 2. Check duplicate company name
    const existingCompany = await prisma.company.findFirst({
      where: { name: { equals: normalizedCompanyName, mode: "insensitive" } },
    });
    if (existingCompany) {
      throw new AppError("A company with this name is already registered.", {
        statusCode: 409,
        code: "COMPANY_ALREADY_EXISTS",
        isOperational: true,
      });
    }

    // 3. Check duplicate user email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new AppError("An account with this email is already registered.", {
        statusCode: 409,
        code: "EMAIL_ALREADY_EXISTS",
        isOperational: true,
      });
    }

    // 4. Check for pending application
    const pendingApp = await trialApplicationStore.findPendingByEmailOrCompany(
      normalizedEmail,
      normalizedCompanyName
    );
    if (pendingApp) {
      throw new AppError(
        "A trial application for this organization or email is already pending review. Our team will notify you shortly.",
        {
          statusCode: 409,
          code: "TRIAL_APPLICATION_ALREADY_PENDING",
          isOperational: true,
        }
      );
    }

    // 5. Check previously approved trial history
    const previousApproved = await trialApplicationStore.findApplicationByEmail(normalizedEmail);
    if (previousApproved && previousApproved.status === TRIAL_APPLICATION_STATUS.APPROVED) {
      throw new AppError("This organization or email has already utilized a free Demo trial.", {
        statusCode: 409,
        code: "TRIAL_ALREADY_UTILIZED",
        isOperational: true,
      });
    }

    // 6. Hash password
    const passwordHash = await hashPassword(validated.password);

    // 7. Detect business email vs free consumer email
    const isBusiness = isBusinessDomain(normalizedEmail);

    // 8. Create application in store
    const application = await trialApplicationStore.createApplication({
      companyName: normalizedCompanyName,
      ownerName: validated.ownerName.trim(),
      businessEmail: normalizedEmail,
      phone: validated.phone || null,
      website: validated.website || null,
      businessDescription: validated.businessDescription || null,
      industry: validated.industry || null,
      passwordHash,
      isBusinessEmail: isBusiness,
      ipAddress: clientIp,
      userAgent,
    });

    // 9. Clean up verified OTP
    await trialApplicationStore.deleteOtp(normalizedEmail);

    return {
      message: "Trial application submitted successfully. Our team will review your application and send your workspace access link shortly.",
      application: {
        id: application.id,
        companyName: application.companyName,
        ownerName: application.ownerName,
        businessEmail: application.businessEmail,
        isBusinessEmail: application.isBusinessEmail,
        status: application.status,
        createdAt: application.createdAt,
      },
    };
  }

  /**
   * 3. Super Admin: List Trial Requests with abuse signals & counts
   */
  async listTrialRequests({ page = 1, limit = 20, status = "ALL", search = "" }) {
    const result = await trialApplicationStore.listApplications({
      page,
      limit,
      status,
      search,
    });

    // Calculate status overview counts
    const allApps = await trialApplicationStore.listApplications({ page: 1, limit: 1000, status: "ALL" });
    const counts = {
      all: allApps.total,
      pending: allApps.items.filter((a) => a.status === TRIAL_APPLICATION_STATUS.PENDING_REVIEW).length,
      approved: allApps.items.filter((a) => a.status === TRIAL_APPLICATION_STATUS.APPROVED).length,
      rejected: allApps.items.filter((a) => a.status === TRIAL_APPLICATION_STATUS.REJECTED).length,
    };

    // Enrich items with abuse detection / duplicate signals
    const enrichedItems = await Promise.all(
      result.items.map(async (app) => {
        // Warning 1: Company name collision
        let existingCompany = null;
        try {
          existingCompany = await prisma.company.findFirst({
            where: { name: { equals: app.companyName, mode: "insensitive" } },
            select: { id: true, name: true, slug: true },
          });
        } catch (_) {}

        // Warning 2: Existing user collision
        let existingUser = null;
        try {
          existingUser = await prisma.user.findUnique({
            where: { email: app.businessEmail },
            select: { id: true, email: true },
          });
        } catch (_) {}

        // Warning 3: Shared IP submissions
        const sameIpCount = app.ipAddress
          ? allApps.items.filter((a) => a.ipAddress === app.ipAddress).length
          : 1;

        return {
          id: app.id,
          companyName: app.companyName,
          ownerName: app.ownerName,
          businessEmail: app.businessEmail,
          phone: app.phone,
          website: app.website,
          businessDescription: app.businessDescription,
          industry: app.industry,
          isBusinessEmail: Boolean(app.isBusinessEmail),
          emailVerified: Boolean(app.emailVerified),
          status: app.status,
          reviewerId: app.reviewerId,
          reviewedAt: app.reviewedAt,
          rejectionReason: app.rejectionReason,
          reviewNotes: app.reviewNotes,
          approvedCompanyId: app.approvedCompanyId,
          approvedCompanySlug: app.approvedCompanySlug,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
          warnings: {
            hasExistingCompanyConflict: Boolean(existingCompany && existingCompany.id !== app.approvedCompanyId),
            hasExistingUserConflict: Boolean(existingUser),
            sharedIpCount: sameIpCount > 1 ? sameIpCount : 0,
            isFreeEmailProvider: !app.isBusinessEmail,
          },
        };
      })
    );

    return {
      requests: enrichedItems,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      counts,
    };
  }

  /**
   * 4. Super Admin: Get Single Trial Request Details
   */
  async getTrialRequestById(id) {
    const app = await trialApplicationStore.findApplicationById(id);
    if (!app) {
      throw new AppError("Trial application not found.", {
        statusCode: 404,
        code: "TRIAL_APPLICATION_NOT_FOUND",
        isOperational: true,
      });
    }

    return {
      id: app.id,
      companyName: app.companyName,
      ownerName: app.ownerName,
      businessEmail: app.businessEmail,
      phone: app.phone,
      website: app.website,
      businessDescription: app.businessDescription,
      industry: app.industry,
      isBusinessEmail: Boolean(app.isBusinessEmail),
      emailVerified: Boolean(app.emailVerified),
      status: app.status,
      reviewerId: app.reviewerId,
      reviewedAt: app.reviewedAt,
      rejectionReason: app.rejectionReason,
      reviewNotes: app.reviewNotes,
      approvedCompanyId: app.approvedCompanyId,
      approvedCompanySlug: app.approvedCompanySlug,
      ipAddress: app.ipAddress,
      userAgent: app.userAgent,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  /**
   * 5. Super Admin: Approve Demo Trial Application
   * Follows exact Specification 5:
   * - 7-day timer starts at exact moment of approval.
   * - Sets 168 hours duration.
   * - Enforces Demo limits: 2 HR seats, 20 unique candidates, 10 monthly assessment invites.
   * - Centralized tenant URL utility (zero tokens in links).
   * - Sends approval email to verified Owner.
   */
  async approveApplication(id, reviewerUser, internalNotes = null) {
    if (approvalLocks.has(id)) {
      throw new AppError("An approval or email delivery action is already in progress for this application.", {
        statusCode: 409,
        code: "APPROVAL_IN_PROGRESS",
        isOperational: true,
      });
    }

    approvalLocks.add(id);

    try {
      const app = await trialApplicationStore.findApplicationById(id);
      if (!app) {
        throw new AppError("Trial application not found.", {
          statusCode: 404,
          code: "TRIAL_APPLICATION_NOT_FOUND",
          isOperational: true,
        });
      }

      // Safe duplicate protection & retry: if already approved, check email status
      if (app.status === TRIAL_APPLICATION_STATUS.APPROVED) {
        if (app.approvalEmailSent) {
          const workspaceUrl = app.approvedCompanySlug
            ? buildCompanyTenantUrl({ slug: app.approvedCompanySlug }, "/login")
            : null;

          return {
            message: "Trial already approved and approval email was already sent to the Owner.",
            emailSent: true,
            alreadyApproved: true,
            company: {
              id: app.approvedCompanyId,
              slug: app.approvedCompanySlug,
              workspaceUrl,
            },
          };
        } else {
          // Re-send without re-creating company, user, or subscription
          return await this.resendApprovalEmail(id, reviewerUser);
        }
      }

      if (app.status === TRIAL_APPLICATION_STATUS.REJECTED) {
        throw new AppError("Cannot approve an application that has already been rejected.", {
          statusCode: 400,
          code: "APPLICATION_ALREADY_REJECTED",
          isOperational: true,
        });
      }

      // Security check: Must have verified email prior to approval
      if (!app.emailVerified) {
        throw new AppError("Cannot approve trial application with unverified email address.", {
          statusCode: 400,
          code: "EMAIL_NOT_VERIFIED",
          isOperational: true,
        });
      }

      const normalizedEmail = app.businessEmail.toLowerCase().trim();
      const normalizedCompanyName = app.companyName.trim();

      // 1. Revalidate unique checks before activating
      const existingCompany = await prisma.company.findFirst({
        where: { name: { equals: normalizedCompanyName, mode: "insensitive" } },
      });
      if (existingCompany) {
        throw new AppError("A company with this name is already registered.", {
          statusCode: 409,
          code: "COMPANY_ALREADY_EXISTS",
          isOperational: true,
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        throw new AppError("An account with this email is already registered.", {
          statusCode: 409,
          code: "USER_ALREADY_EXISTS",
          isOperational: true,
        });
      }

      const approvalNow = new Date();
      // Exactly 168 hours (7 days) starting from this exact moment
      const expiresAt = new Date(approvalNow.getTime() + TRIAL_LIMITS.DURATION_HOURS * 60 * 60 * 1000);
      const slug = await generateUniqueSlug(normalizedCompanyName);

      // 2. Execute Transaction
      let companyResult = null;
      let userResult = null;
      let subscriptionResult = null;

      await prisma.$transaction(async (tx) => {
        // Step A: Create Company with safe schema fields
        companyResult = await tx.company.create({
          data: {
            name: normalizedCompanyName,
            slug,
            website: app.website || null,
            industry: app.industry || null,
            description: app.businessDescription || null,
            phone: app.phone || null,
            status: "ACTIVE",
          },
        });

        // Step B: Create Owner User
        userResult = await tx.user.create({
          data: {
            name: app.ownerName.trim(),
            email: normalizedEmail,
            password: app.passwordHash,
            status: "ACTIVE",
            role: "HR",
          },
        });

        // Step C: Create Company Member (OWNER role)
        await tx.companyMember.create({
          data: {
            companyId: companyResult.id,
            userId: userResult.id,
            role: "OWNER",
          },
        });

        // Step D: Create Demo Subscription record if model available
        try {
          if (tx.subscription) {
            let demoPlan = null;
            try {
              demoPlan = await tx.plan.findUnique({ where: { code: "DEMO" } });
            } catch (_) {}

            subscriptionResult = await tx.subscription.create({
              data: {
                companyId: companyResult.id,
                planId: demoPlan?.id || null,
                planCode: "DEMO",
                planName: "Demo Plan",
                billingCycle: "MONTHLY",
                status: "ACTIVE",
                isTrial: true,
                amount: 0,
                currency: "INR",
                seatLimit: TRIAL_LIMITS.HR_SEATS,
                candidateLimit: TRIAL_LIMITS.TOTAL_CANDIDATES,
                inviteLimit: TRIAL_LIMITS.MONTHLY_INVITATIONS,
                startDate: approvalNow,
                endDate: expiresAt,
              },
            });
          }
        } catch (subErr) {
          console.warn("[TrialApplication] Subscription snapshot creation warning:", subErr.message);
        }
      });

      // 3. Update Trial Application status in store
      await trialApplicationStore.updateApplication(id, {
        status: TRIAL_APPLICATION_STATUS.APPROVED,
        reviewerId: reviewerUser.id,
        reviewedAt: approvalNow,
        approvedCompanyId: companyResult.id,
        approvedCompanySlug: companyResult.slug,
        reviewNotes: internalNotes?.trim() || null,
      });

      // 4. Record Audit Log
      try {
        await auditService.createAuditLog({
          companyId: companyResult.id,
          actorUserId: reviewerUser.id,
          action: "TRIAL_APPLICATION_APPROVED",
          entityType: "TRIAL_APPLICATION",
          entityId: id,
          metadata: {
            applicationId: id,
            companyName: companyResult.name,
            companySlug: companyResult.slug,
            ownerEmail: normalizedEmail,
            trialStartsAt: approvalNow.toISOString(),
            trialExpiresAt: expiresAt.toISOString(),
            reviewerEmail: reviewerUser.email,
          },
        });
      } catch (auditErr) {
        console.warn("[TrialApplication] Audit log creation warning:", auditErr.message);
      }

      // 5. Build Workspace Login URL using centralized tenant URL utility (zero tokens)
      const workspaceUrl = buildCompanyTenantUrl(companyResult, "/login");

      // 6. Format Dates for Email
      const formatDate = (date) =>
        new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);

      // 7. Send Approval Email (Only after successful company creation & activation)
      let emailSent = false;
      let emailError = null;

      try {
        const emailContent = buildTrialApprovalEmail({
          ownerName: app.ownerName,
          companyName: companyResult.name,
          planName: "Demo Plan",
          startDate: formatDate(approvalNow),
          endDate: formatDate(expiresAt),
          seatLimit: TRIAL_LIMITS.HR_SEATS,
          candidateLimit: TRIAL_LIMITS.TOTAL_CANDIDATES,
          inviteLimit: TRIAL_LIMITS.MONTHLY_INVITATIONS,
          workspaceUrl,
        });

        const sendResult = await sendEmail({
          to: normalizedEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        emailSent = Boolean(
          sendResult?.messageId ||
          (Array.isArray(sendResult?.accepted) && sendResult.accepted.length > 0)
        );
        if (!emailSent) {
          emailError = "Email provider did not confirm acceptance.";
        }
      } catch (emailErr) {
        emailSent = false;
        emailError = emailErr?.message || "Email delivery failed";
        console.error("[TrialApplication] Failed to dispatch approval email:", emailErr.message);
      }

      // 8. Store notification delivery status and timestamps
      await trialApplicationStore.updateApplication(id, {
        approvalEmailSent: emailSent,
        approvalEmailSentAt: emailSent ? new Date() : null,
        approvalEmailError: emailError,
      });

      // 9. Exact feedback message required by Requirement 5
      const feedbackMessage = emailSent
        ? "Trial approved and workspace activated. Approval email sent to the Owner."
        : "Trial approved and workspace activated, but the email could not be delivered. You can retry sending the approval email.";

      return {
        message: feedbackMessage,
        emailSent,
        emailError,
        company: {
          id: companyResult.id,
          name: companyResult.name,
          slug: companyResult.slug,
          workspaceUrl,
        },
        trial: {
          startsAt: approvalNow,
          expiresAt,
          durationHours: TRIAL_LIMITS.DURATION_HOURS,
          hrSeats: TRIAL_LIMITS.HR_SEATS,
          candidates: TRIAL_LIMITS.TOTAL_CANDIDATES,
          invites: TRIAL_LIMITS.MONTHLY_INVITATIONS,
        },
      };
    } finally {
      approvalLocks.delete(id);
    }
  }

  /**
   * Resend Approval Email for an Approved Trial Application.
   * Safe retry: Never duplicates company or subscription records.
   * Recipient is strictly the verified registered business email.
   */
  async resendApprovalEmail(id, reviewerUser) {
    if (approvalLocks.has(id)) {
      throw new AppError("An approval or email delivery action is already in progress for this application.", {
        statusCode: 409,
        code: "ACTION_IN_PROGRESS",
        isOperational: true,
      });
    }

    approvalLocks.add(id);

    try {
      const app = await trialApplicationStore.findApplicationById(id);
      if (!app) {
        throw new AppError("Trial application not found.", {
          statusCode: 404,
          code: "TRIAL_APPLICATION_NOT_FOUND",
          isOperational: true,
        });
      }

      if (app.status !== TRIAL_APPLICATION_STATUS.APPROVED) {
        throw new AppError("Cannot send approval email for an unapproved application.", {
          statusCode: 400,
          code: "APPLICATION_NOT_APPROVED",
          isOperational: true,
        });
      }

      // Strictly verify registered email
      const normalizedEmail = app.businessEmail.toLowerCase().trim();

      // Resolve approved company
      let company = null;
      if (app.approvedCompanyId) {
        company = await prisma.company.findUnique({ where: { id: app.approvedCompanyId } });
      }
      if (!company && app.approvedCompanySlug) {
        company = await prisma.company.findUnique({ where: { slug: app.approvedCompanySlug } });
      }
      if (!company) {
        company = await prisma.company.findFirst({
          where: { name: { equals: app.companyName.trim(), mode: "insensitive" } },
        });
      }

      if (!company) {
        throw new AppError("Approved company workspace could not be located.", {
          statusCode: 404,
          code: "COMPANY_NOT_FOUND",
          isOperational: true,
        });
      }

      // Generate tenant workspace login URL using centralized utility
      const workspaceUrl = buildCompanyTenantUrl(company, "/login");

      const approvalNow = app.reviewedAt ? new Date(app.reviewedAt) : new Date(app.updatedAt || app.createdAt);
      const expiresAt = new Date(approvalNow.getTime() + TRIAL_LIMITS.DURATION_HOURS * 60 * 60 * 1000);

      const formatDate = (date) =>
        new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);

      let emailSent = false;
      let emailError = null;

      try {
        const emailContent = buildTrialApprovalEmail({
          ownerName: app.ownerName,
          companyName: company.name,
          planName: "Demo Plan",
          startDate: formatDate(approvalNow),
          endDate: formatDate(expiresAt),
          seatLimit: TRIAL_LIMITS.HR_SEATS,
          candidateLimit: TRIAL_LIMITS.TOTAL_CANDIDATES,
          inviteLimit: TRIAL_LIMITS.MONTHLY_INVITATIONS,
          workspaceUrl,
        });

        const sendResult = await sendEmail({
          to: normalizedEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        emailSent = Boolean(
          sendResult?.messageId ||
          (Array.isArray(sendResult?.accepted) && sendResult.accepted.length > 0)
        );
        if (!emailSent) {
          emailError = "Email provider did not confirm acceptance.";
        }
      } catch (err) {
        emailSent = false;
        emailError = err?.message || "Email delivery failed";
        console.error("[TrialApplication] Resend approval email failed:", err.message);
      }

      await trialApplicationStore.updateApplication(id, {
        approvalEmailSent: emailSent,
        approvalEmailSentAt: emailSent ? new Date() : app.approvalEmailSentAt,
        approvalEmailError: emailError,
      });

      // Record audit log
      try {
        await auditService.createAuditLog({
          companyId: company.id,
          actorUserId: reviewerUser.id,
          action: "TRIAL_APPROVAL_EMAIL_RESENT",
          entityType: "TRIAL_APPLICATION",
          entityId: id,
          metadata: {
            applicationId: id,
            companyName: company.name,
            ownerEmail: normalizedEmail,
            emailSent,
            emailError,
            reviewerEmail: reviewerUser.email,
          },
        });
      } catch (_) {}

      if (!emailSent) {
        throw new AppError(
          `Approval email could not be delivered: ${emailError || "Transport failure"}. You can retry sending the approval email.`,
          {
            statusCode: 502,
            code: "EMAIL_DELIVERY_FAILED",
            isOperational: true,
          }
        );
      }

      return {
        message: "Trial approved and workspace activated. Approval email sent to the Owner.",
        emailSent: true,
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          workspaceUrl,
        },
      };
    } finally {
      approvalLocks.delete(id);
    }
  }

  /**
   * 6. Super Admin: Reject Demo Trial Application
   */
  async rejectApplication(id, reviewerUser, { rejectionReason, reviewNotes = null }) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new AppError("A rejection reason must be specified for internal records.", {
        statusCode: 400,
        code: "REJECTION_REASON_REQUIRED",
        isOperational: true,
      });
    }

    const app = await trialApplicationStore.findApplicationById(id);
    if (!app) {
      throw new AppError("Trial application not found.", {
        statusCode: 404,
        code: "TRIAL_APPLICATION_NOT_FOUND",
        isOperational: true,
      });
    }

    if (app.status === TRIAL_APPLICATION_STATUS.APPROVED) {
      throw new AppError("Cannot reject an application that has already been approved.", {
        statusCode: 400,
        code: "APPLICATION_ALREADY_APPROVED",
        isOperational: true,
      });
    }

    const now = new Date();

    // 1. Update status
    await trialApplicationStore.updateApplication(id, {
      status: TRIAL_APPLICATION_STATUS.REJECTED,
      reviewerId: reviewerUser.id,
      reviewedAt: now,
      rejectionReason: rejectionReason.trim(),
      reviewNotes: reviewNotes?.trim() || null,
    });

    // 2. Platform Audit Log
    try {
      await auditService.createAuditLog({
        companyId: null,
        actorUserId: reviewerUser.id,
        action: "TRIAL_APPLICATION_REJECTED",
        entityType: "TRIAL_APPLICATION",
        entityId: id,
        metadata: {
          applicationId: id,
          companyName: app.companyName,
          ownerEmail: app.businessEmail,
          rejectionReason,
          reviewerEmail: reviewerUser.email,
        },
      });
    } catch (auditErr) {
      console.warn("[TrialApplication] Audit log creation warning:", auditErr.message);
    }

    // 3. Send Polite Rejection Email (without exposing internal review notes)
    try {
      const emailContent = buildTrialRejectionEmail({
        ownerName: app.ownerName,
        companyName: app.companyName,
        reason: rejectionReason.trim(),
      });

      await sendEmail({
        to: app.businessEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (mailErr) {
      console.error("[TrialApplication] Failed to dispatch rejection email:", mailErr.message);
    }

    return {
      message: "Trial application has been rejected.",
      applicationId: id,
    };
  }
}

module.exports = new TrialApplicationService();

