"use strict";

const companyInvitationService = require("./company.invitation.service");

const createInvitation = async (req, res, next) => {
  try {
    const result = await companyInvitationService.createInvitation(
      req.companyId,
      req.companyMember.role,
      req.user.id,
      req.body
    );

    const { rawToken, ...safeResponse } = result;

    return res.status(201).json({
      success: true,
      message: "Company invitation created successfully",
      data: safeResponse,
    });
  } catch (error) {
    return next(error);
  }
};

const acceptInvitation = async (req, res, next) => {
  try {
    const result = await companyInvitationService.acceptInvitation(
      req.user.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: result.alreadyMember
        ? "You are already a member of this company"
        : "Company invitation accepted successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const revokeInvitation = async (req, res, next) => {
  try {
    const result = await companyInvitationService.revokeInvitation(
      req.companyId,
      req.companyMember.role,
      req.params.invitationId
    );

    return res.status(200).json({
      success: true,
      message: "Company invitation revoked successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const listInvitations = async (req, res, next) => {
  try {
    const result = await companyInvitationService.listInvitations(
      req.companyId,
      req.companyMember.role,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Company invitations fetched successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
};
