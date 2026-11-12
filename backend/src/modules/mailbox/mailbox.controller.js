"use strict";

const env = require("../../config/env");
const service = require("./mailbox.service");
const { prisma } = require("../../config/prisma");
const { buildCompanyTenantUrl } = require("../../utils/tenant-url");
const authService = require("../auth/auth.service");

function getAuthenticatedUser(req) {
  if (!req.user || !req.user.id) {
    const error = new Error("Authentication required");
    error.code = "AUTHENTICATION_REQUIRED";
    error.statusCode = 401;
    throw error;
  }
  return req.user;
}

async function connectGoogleMailbox(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const companyId = req.companyId || req.company?.id || null;
    const originHeader = req.headers.origin || req.headers.referer || null;
    let returnOrigin = null;
    if (originHeader) {
      try {
        const parsed = new URL(originHeader);
        returnOrigin = parsed.origin;
      } catch {}
    }
    const authUrl = await service.getAuthUrl(user.id, companyId, returnOrigin);

    return res.status(200).json({
      success: true,
      data: {
        url: authUrl,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function handleGoogleCallback(req, res, next) {
  try {
    const code = req.query.code;
    const stateToken = req.query.state;

    if (!code) {
      const error = new Error("Authorization code is required");
      error.code = "AUTH_CODE_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    if (!stateToken) {
      const error = new Error("OAuth state parameter is required");
      error.code = "OAUTH_STATE_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    // Cryptographically verify and single-use consume state token (rejects raw userId, expired, or replayed states)
    const stateContext = await service.verifyAndConsumeOAuthState(stateToken);
    const userId = stateContext.userId;
    const companyId = stateContext.companyId || null;
    const returnOrigin = stateContext.returnOrigin || null;

    const result = await service.handleCallback(code, userId, companyId);

    // 1. Authoritative tenant company resolution
    let targetCompany = null;
    if (companyId) {
      targetCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          slug: true,
          customDomain: true,
          customDomainVerified: true,
        },
      });
    }

    if (!targetCompany && userId) {
      const membership = await prisma.companyMember.findFirst({
        where: { userId },
        select: {
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
      targetCompany = membership?.company || null;
    }

    if (targetCompany) {
      targetCompany = {
        ...targetCompany,
        domainMode: targetCompany.customDomain ? "CUSTOM_DOMAIN" : "SUBDOMAIN",
      };
    }

    // 2. Issue a short-lived single-use exchange ticket so user is seamlessly re-authenticated on return
    let exchangeTicket = null;
    try {
      const ticketRes = await authService.createExchangeTicket(userId, targetCompany?.id || companyId);
      exchangeTicket = ticketRes?.ticket || null;
    } catch (ticketErr) {
      console.warn("[MailboxController] Failed to generate exchange ticket:", ticketErr.message);
    }

    // 3. Determine the base tenant target URL for /candidates
    let targetBaseUrl = "";
    if (targetCompany) {
      targetBaseUrl = buildCompanyTenantUrl(targetCompany, "/candidates", {
        mailbox: "connected",
        email: result.email,
      });
    } else if (returnOrigin) {
      const url = new URL("/candidates", returnOrigin);
      url.searchParams.set("mailbox", "connected");
      url.searchParams.set("email", result.email);
      targetBaseUrl = url.toString();
    } else {
      const fallbackUrl = new URL("/candidates", env.frontend.url);
      fallbackUrl.searchParams.set("mailbox", "connected");
      fallbackUrl.searchParams.set("email", result.email);
      targetBaseUrl = fallbackUrl.toString();
    }

    // 4. Wrap with /auth/handoff to guarantee 100% active session persistence across domains/subdomains
    if (exchangeTicket) {
      try {
        const parsedTarget = new URL(targetBaseUrl);
        const origin = parsedTarget.origin;
        const redirectPathWithQuery = `${parsedTarget.pathname}${parsedTarget.search}`;
        const handoffUrl = new URL("/auth/handoff", origin);
        handoffUrl.searchParams.set("ticket", exchangeTicket);
        handoffUrl.searchParams.set("redirect", redirectPathWithQuery);
        return res.redirect(handoffUrl.toString());
      } catch (handoffErr) {
        console.warn("[MailboxController] Failed to construct handoff URL, falling back:", handoffErr.message);
      }
    }

    return res.redirect(targetBaseUrl);
  } catch (error) {
    return next(error);
  }
}

async function getMailboxStatus(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const status = await service.getMailboxStatus(user.id);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        isSyncingNow: service.isSyncInProgress(user.id),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function syncMailboxNow(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const companyId = req.companyId || req.company?.id || null;

    if (!companyId) {
      const error = new Error("Active company context is required for mailbox resume sync.");
      error.code = "COMPANY_CONTEXT_REQUIRED";
      error.statusCode = 400;
      throw error;
    }
    
    if (service.isSyncInProgress(user.id)) {
      const error = new Error("Mailbox sync is already in progress for your account. Please wait a moment.");
      error.code = "MAILBOX_SYNC_IN_PROGRESS";
      error.statusCode = 409;
      throw error;
    }

    let dateRangeOptions = null;
    const { fromDate, toDate, timezone } = req.body || {};
    
    if (fromDate || toDate) {
      if (!fromDate || !toDate) {
        const error = new Error("Both fromDate and toDate are required for a date range sync.");
        error.code = "INVALID_DATE_RANGE";
        error.statusCode = 400;
        throw error;
      }
      
      const clientTimezone = timezone || req.headers["x-timezone"] || "UTC";
      const bounds = service.resolveDateRangeBounds(fromDate, toDate, clientTimezone);

      if (!bounds) {
        const error = new Error("Invalid date format provided.");
        error.code = "INVALID_DATE_FORMAT";
        error.statusCode = 400;
        throw error;
      }
      
      if (bounds.startTimestampMs > bounds.endTimestampMs) {
        const error = new Error("fromDate cannot be after toDate.");
        error.code = "INVALID_DATE_RANGE";
        error.statusCode = 400;
        throw error;
      }
      
      const from = new Date(bounds.startTimestampMs);
      const toInclusive = new Date(bounds.endTimestampMs);

      // Check if To Date is in the future relative to now
      const isFutureDateSync = toInclusive.getTime() > Date.now();

      // Ensure we use the string format YYYY-MM-DD for Gmail query logic
      dateRangeOptions = {
        fromDate: bounds.fromDateStr,
        toDate: bounds.toDateStr,
        isFutureDateSync,
        dateRangeSyncFrom: from,
        dateRangeSyncTo: toInclusive,
        startTimestampMs: bounds.startTimestampMs,
        endTimestampMs: bounds.endTimestampMs,
        timezone: clientTimezone,
      };

      if (isFutureDateSync) {
        const repository = require("./mailbox.repository");
        await repository.updateMailboxSyncStatus(user.id, {
          dateRangeSyncEnabled: true,
          dateRangeSyncFrom: from,
          dateRangeSyncTo: toInclusive,
          dateRangeLastSyncedAt: from,
        });
      }
    }

    const result = await service.syncMailboxForUser(user.id, 25000, dateRangeOptions, companyId);

    let message = "Mailbox up to date. No new resume emails found.";
    if (result.processedResumes > 0) {
      message = `Synced ${result.scanned} email(s). ${result.processedResumes} new candidate resume(s) processed.`;
    } else if (result.skipped > 0) {
      message = `Mailbox up to date. ${result.scanned} email(s) scanned (${result.skipped} already processed).`;
    }

    return res.status(200).json({
      success: true,
      code: "MAILBOX_SYNC_COMPLETED",
      message,
      processedResumes: result.processedResumes,
      scanned: result.scanned,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: result.durationMs,
      data: {
        ...result,
        message,
        code: "MAILBOX_SYNC_COMPLETED",
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function disconnectMailbox(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.disconnectMailbox(user.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function stopAutomaticSync(req, res, next) {
  try {
    const user = getAuthenticatedUser(req);
    const result = await service.stopAutomaticSync(user.id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  connectGoogleMailbox,
  handleGoogleCallback,
  getMailboxStatus,
  syncMailboxNow,
  disconnectMailbox,
  stopAutomaticSync,
};
