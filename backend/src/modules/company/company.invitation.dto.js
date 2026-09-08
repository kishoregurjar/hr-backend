"use strict";

const createCompanyInvitationDto = (invitation) => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  acceptedAt: invitation.acceptedAt ?? null,
  createdAt: invitation.createdAt,
  updatedAt: invitation.updatedAt,
});

const createCompanyInvitationListDto = ({
  invitations,
  total,
  page,
  limit,
}) => ({
  invitations: invitations.map(createCompanyInvitationDto),

  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPreviousPage: page > 1,
  },
});

module.exports = {
  createCompanyInvitationDto,
  createCompanyInvitationListDto,
};

