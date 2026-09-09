"use strict";

const mapOwner = ({ membership, activation }) => ({
  membership: {
    id: membership.id,
    role: membership.role,
    createdAt: membership.createdAt,
  },
  company: {
    id: membership.company.id,
    name: membership.company.name,
    slug: membership.company.slug,
    status: membership.company.status,
  },
  owner: {
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    platformRole: membership.user.role,
    status: membership.user.status,
    createdAt: membership.user.createdAt,
    updatedAt: membership.user.updatedAt,
  },
  activation: activation
    ? {
        status: activation.status,
        expiresAt: activation.expiresAt,
        consumedAt: activation.consumedAt,
        createdAt: activation.createdAt,
        updatedAt: activation.updatedAt,
      }
    : null,
});

const mapRevokedActivation = (activation) => ({
  status: activation.status,
  expiresAt: activation.expiresAt,
  consumedAt: activation.consumedAt,
  updatedAt: activation.updatedAt,
});

module.exports = {
  mapOwner,
  mapRevokedActivation,
};
