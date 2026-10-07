"use strict";

const analyticsService = require("./super-admin.analytics.service");
const auditService = require("../company/company.audit.service");

const getAnalytics = async (req, res, next) => {
  try {
    const params = req.validatedData || req.query || {};
    const data = await analyticsService.getPlatformAnalytics(params);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const params = req.validatedData || req.query || {};
    const analyticsData = await analyticsService.getPlatformAnalytics(params);

    const csvContent = analyticsService.generateAnalyticsCsv(analyticsData);
    const filename = analyticsService.generateExportFilename(analyticsData.dateRange, "csv");

    try {
      const auditCtx = typeof req.get === "function"
        ? auditService.createRequestAuditContext(req)
        : { ipAddress: req.ip || null, userAgent: req.headers?.["user-agent"] || null };

      await auditService.createAuditLog({
        companyId: null,
        actorUserId: req.user?.id || null,
        action: "PLATFORM_ANALYTICS_EXPORTED",
        entityType: "PLATFORM_ANALYTICS",
        entityId: null,
        metadata: {
          format: "CSV",
          preset: analyticsData.dateRange?.preset || "all",
          dateFrom: analyticsData.dateRange?.dateFrom || null,
          dateTo: analyticsData.dateRange?.dateTo || null,
        },
        ...auditCtx,
      });
    } catch (auditErr) {
      console.error("Failed to log PLATFORM_ANALYTICS_EXPORTED audit log for CSV:", auditErr);
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const params = req.validatedData || req.query || {};
    const analyticsData = await analyticsService.getPlatformAnalytics(params);

    const pdfBuffer = await analyticsService.generateAnalyticsPdf(analyticsData);
    const filename = analyticsService.generateExportFilename(analyticsData.dateRange, "pdf");

    try {
      const auditCtx = typeof req.get === "function"
        ? auditService.createRequestAuditContext(req)
        : { ipAddress: req.ip || null, userAgent: req.headers?.["user-agent"] || null };

      await auditService.createAuditLog({
        companyId: null,
        actorUserId: req.user?.id || null,
        action: "PLATFORM_ANALYTICS_EXPORTED",
        entityType: "PLATFORM_ANALYTICS",
        entityId: null,
        metadata: {
          format: "PDF",
          preset: analyticsData.dateRange?.preset || "all",
          dateFrom: analyticsData.dateRange?.dateFrom || null,
          dateTo: analyticsData.dateRange?.dateTo || null,
        },
        ...auditCtx,
      });
    } catch (auditErr) {
      console.error("Failed to log PLATFORM_ANALYTICS_EXPORTED audit log for PDF:", auditErr);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAnalytics,
  exportCsv,
  exportPdf,
};

