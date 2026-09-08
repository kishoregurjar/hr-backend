"use strict";

const { COMPANY_CONSTANTS } = require("./company.constants");

const COMPANY_ROLES = Object.freeze({
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  RECRUITER: "RECRUITER",
});

const COMPANY_PERMISSIONS = Object.freeze({
  VIEW_COMPANY: "VIEW_COMPANY",
  UPDATE_COMPANY: "UPDATE_COMPANY",
  UPLOAD_LOGO: "UPLOAD_LOGO",

  VIEW_MEMBERS: "VIEW_MEMBERS",
  INVITE_MEMBER: "INVITE_MEMBER",
  UPDATE_MEMBER_ROLE: "UPDATE_MEMBER_ROLE",
  REMOVE_MEMBER: "REMOVE_MEMBER",

  TRANSFER_OWNERSHIP: "TRANSFER_OWNERSHIP",
  DELETE_COMPANY: "DELETE_COMPANY",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
});

const ROLE_PERMISSIONS = Object.freeze({
  [COMPANY_ROLES.OWNER]: new Set([
    COMPANY_PERMISSIONS.VIEW_COMPANY,
    COMPANY_PERMISSIONS.UPDATE_COMPANY,
    COMPANY_PERMISSIONS.UPLOAD_LOGO,

    COMPANY_PERMISSIONS.VIEW_MEMBERS,
    COMPANY_PERMISSIONS.INVITE_MEMBER,
    COMPANY_PERMISSIONS.UPDATE_MEMBER_ROLE,
    COMPANY_PERMISSIONS.REMOVE_MEMBER,

    COMPANY_PERMISSIONS.TRANSFER_OWNERSHIP,
    COMPANY_PERMISSIONS.DELETE_COMPANY,
    COMPANY_PERMISSIONS.VIEW_AUDIT_LOGS,
  ]),

  [COMPANY_ROLES.ADMIN]: new Set([
    COMPANY_PERMISSIONS.VIEW_COMPANY,
    COMPANY_PERMISSIONS.UPDATE_COMPANY,
    COMPANY_PERMISSIONS.UPLOAD_LOGO,

    COMPANY_PERMISSIONS.VIEW_MEMBERS,
    COMPANY_PERMISSIONS.INVITE_MEMBER,
    COMPANY_PERMISSIONS.UPDATE_MEMBER_ROLE,
    COMPANY_PERMISSIONS.REMOVE_MEMBER,
    COMPANY_PERMISSIONS.VIEW_AUDIT_LOGS,
  ]),

  [COMPANY_ROLES.RECRUITER]: new Set([
    COMPANY_PERMISSIONS.VIEW_COMPANY,
    COMPANY_PERMISSIONS.VIEW_MEMBERS,
  ]),
});

const isValidCompanyRole = (role) => {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
};

const hasPermission = (role, permission) => {
  if (!isValidCompanyRole(role)) {
    return false;
  }

  return ROLE_PERMISSIONS[role].has(permission);
};

const assertPermission = (role, permission) => {
  if (!hasPermission(role, permission)) {
    const error = new Error(
      "You do not have permission to perform this action"
    );

    error.code = COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED;
    error.statusCode = 403;

    throw error;
  }

  return true;
};

const assertOwner = (role) => {
  if (role !== COMPANY_ROLES.OWNER) {
    const error = new Error(
      "Only the company owner can perform this action"
    );

    error.code = COMPANY_CONSTANTS.ERROR_CODES.COMPANY_ACCESS_DENIED;
    error.statusCode = 403;

    throw error;
  }

  return true;
};

const getRolePermissions = (role) => {
  if (!isValidCompanyRole(role)) {
    return [];
  }

  return Array.from(ROLE_PERMISSIONS[role]);
};

module.exports = {
  COMPANY_ROLES,
  COMPANY_PERMISSIONS,
  isValidCompanyRole,
  hasPermission,
  assertPermission,
  assertOwner,
  getRolePermissions,
};
