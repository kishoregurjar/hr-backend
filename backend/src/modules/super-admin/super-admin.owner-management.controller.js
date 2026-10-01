"use strict";

const ownerService = require("./super-admin.owner-management.service");
const auditService = require("../company/company.audit.service");

const getCompanyOwner = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const result = await ownerService.getCompanyOwner(companyId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const revokeOwnerActivation = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const auditContext = auditService.createRequestAuditContext(req);
    const actorUserId = req.user?.id || null;

    const result = await ownerService.revokeOwnerActivation(
      companyId,
      auditContext,
      actorUserId
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCompanyOwner,
  revokeOwnerActivation,
};
