"use strict";

const companyService = require("./company.service");
const auditService = require("./company.audit.service");
const { COMPANY_PERMISSIONS, assertPermission } = require("./company.authorization");

const createCompany = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const result = await companyService.createCompany(
      req.user.id,
      req.body,
      auditContext
    );

    return res.status(201).json({
      success: true,
      message: "Company created successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const getMyCompany = async (req, res, next) => {
  try {
    const result = await companyService.getMyCompany(
      req.companyId,
      req.companyMember.role
    );

    return res.status(200).json({
      success: true,
      message: "Company details fetched successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const updateMyCompany = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const result = await companyService.updateMyCompany(
      req.companyId,
      req.companyMember.role,
      req.body,
      req.user.id,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company updated successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const getMembers = async (req, res, next) => {
  try {
    const result = await companyService.listMembers(
      req.companyId,
      req.companyMember.role,
      {
        page: req.query.page,
        limit: req.query.limit,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Company members fetched successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const inviteMember = async (req, res, next) => {
  try {
    const result = await companyService.inviteMember(
      req.companyId,
      req.companyMember.role,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Company member added successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const member = await companyService.updateMemberRole(
      req.companyId,
      req.companyMember.role,
      req.params.memberId,
      req.body,
      req.user.id,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company member role updated successfully",
      data: member,
    });
  } catch (error) {
    return next(error);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const result = await companyService.removeMember(
      req.companyId,
      req.companyMember.role,
      req.params.memberId,
      req.user.id,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company member removed successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const transferOwnership = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const result = await companyService.transferOwnership(
      req.companyId,
      req.user.id,
      req.companyMember.role,
      req.body,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company ownership transferred successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteCompany = async (req, res, next) => {
  try {
    const auditContext = auditService.createRequestAuditContext(req);
    const result = await companyService.deleteCompany(
      req.companyId,
      req.companyMember.role,
      req.body,
      req.user.id,
      auditContext
    );

    return res.status(200).json({
      success: true,
      message: "Company deleted successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const listAuditLogs = async (req, res, next) => {
  try {
    assertPermission(req.companyMember.role, COMPANY_PERMISSIONS.VIEW_AUDIT_LOGS);

    const result = await auditService.listAuditLogs(
      req.companyId,
      req.companyMember.role,
      {
        page: req.query.page,
        limit: req.query.limit,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Company audit logs fetched successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createCompany,
  getMyCompany,
  updateMyCompany,
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  transferOwnership,
  deleteCompany,
  listAuditLogs,
};
