"use strict";

const mapCompanyInvitation = (invitation) => {
  if (!invitation) {
    return null;
  }

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
};

module.exports = {
  mapCompanyInvitation,
};
