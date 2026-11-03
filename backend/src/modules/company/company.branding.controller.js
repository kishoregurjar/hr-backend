"use strict";

const companyBrandingService = require("./company.branding.service");
const companyFaviconService = require("./company.favicon.service");

/**
 * GET /api/v1/companies/me/branding
 * Retrieve branding configuration for authenticated company.
 */
const getMyBranding = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.company?.id;
    const branding = await companyBrandingService.getBranding(companyId);

    return res.status(200).json({
      success: true,
      message: "Company branding retrieved successfully",
      data: branding,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/companies/me/branding
 * Update branding configuration (OWNER/ADMIN only).
 */
const updateMyBranding = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.company?.id;
    const role = req.companyMember?.role;
    const userId = req.user?.id;

    const auditContext = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    };

    const updatedBranding = await companyBrandingService.updateBranding(
      companyId,
      role,
      req.body,
      userId,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company branding updated successfully",
      data: updatedBranding,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/companies/public/:slug/branding
 * Unauthenticated candidate portal public branding lookup by slug.
 */
const getPublicBranding = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const branding = await companyBrandingService.getPublicBrandingBySlug(slug);

    return res.status(200).json({
      success: true,
      message: "Public branding retrieved successfully",
      data: branding,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/companies/me/favicon
 * Upload and process company favicon (OWNER/ADMIN only).
 */
const uploadFavicon = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.company?.id;
    const role = req.companyMember?.role;
    const userId = req.user?.id;

    const auditContext = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    };

    const result = await companyFaviconService.uploadFavicon(
      companyId,
      role,
      req.file,
      userId,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company favicon uploaded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/companies/me/favicon
 * Remove company favicon (OWNER/ADMIN only).
 */
const deleteFavicon = async (req, res, next) => {
  try {
    const companyId = req.companyId || req.company?.id;
    const role = req.companyMember?.role;
    const userId = req.user?.id;

    const auditContext = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    };

    const result = await companyFaviconService.deleteFavicon(
      companyId,
      role,
      userId,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company favicon removed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyBranding,
  updateMyBranding,
  getPublicBranding,
  uploadFavicon,
  deleteFavicon,
};

