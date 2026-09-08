"use strict";

const crypto = require("crypto");
const { prisma } = require("../../config/prisma");

const companyRepository = require("./company.repository");
const companyInvitationRepository = require("./company.invitation.repository");

const { COMPANY_CONSTANTS } = require("./company.constants");
const {
  COMPANY_PERMISSIONS,
  assertPermission,
} = require("./company.authorization");

const {
  COMPANY_INVITATION_CONSTANTS,
} = require("./company.invitation.constants");

const { createOutboxEvent } = require("./company.outbox.repository");
const { COMPANY_OUTBOX_CONSTANTS } = require("./company.outbox.constants");
const { createEmailDelivery } = require("./company.email.repository");

const auditService = require("./company.audit.service");
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require("./company.audit.constants");

const {
  createCompanyInvitationSchema,
  acceptCompanyInvitationSchema,
  listCompanyInvitationsSchema,
} = require("./company.invitation.validator");

const {
  createCompanyInvitationDto,
  createCompanyInvitationListDto,
  createCompanyMemberDto,
} = require("./company.invitation.dto");

const {
  mapCompanyInvitation,
  mapCompanyMember,
} = require("./company.invitation.mapper");

const createInvitationError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const generateInvitationToken = () => {
  return crypto
    .randomBytes(COMPANY_INVITATION_CONSTANTS.TOKEN.BYTE_LENGTH)
    .toString("hex");
};

const hashInvitationToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const calculateExpirationDate = () => {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + COMPANY_INVITATION_CONSTANTS.EXPIRATION.DAYS
  );
  return expiresAt;
};

const createInvitation = async (
  companyId,
  requesterRole,
  requesterUserId,
  payload
) => {
  assertPermission(requesterRole, COMPANY_PERMISSIONS.INVITE_MEMBER);

  const validatedData = createCompanyInvitationSchema.parse(payload);
  const email = validatedData.email;

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createInvitationError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  const requester = await companyRepository.findUserById(requesterUserId);

  /*
   * Check whether this email already belongs
   * to the company.
   */
  const existingUser = await companyRepository.findUserByEmail(email);

  if (existingUser) {
    const existingMember = await companyRepository.findMember(
      companyId,
      existingUser.id
    );

    if (existingMember) {
      throw createInvitationError(
        "User is already a member of this company",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_EXISTS,
        409
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    /*
     * Expire old invitations first.
     */
    await companyInvitationRepository.expirePendingInvitations(
      companyId,
      new Date(),
      tx
    );

    /*
     * Application-level duplicate check.
     */
    const existingInvitation =
      await companyInvitationRepository.findPendingInvitationByEmail(
        companyId,
        email,
        tx
      );

    if (existingInvitation) {
      throw createInvitationError(
        "A pending invitation already exists for this email",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_EXISTS,
        409
      );
    }

    /*
     * Pending invitation limit.
     */
    const pendingCount =
      await companyInvitationRepository.countPendingInvitations(
        companyId,
        tx
      );

    if (
      pendingCount >=
      COMPANY_INVITATION_CONSTANTS.MAX_PENDING_INVITATIONS_PER_COMPANY
    ) {
      throw createInvitationError(
        "Pending invitation limit reached",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_LIMIT_REACHED,
        409
      );
    }

    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = calculateExpirationDate();

    let invitation;

    try {
      invitation = await companyInvitationRepository.createInvitation(
        {
          companyId,
          email,
          role: validatedData.role,
          tokenHash,
          expiresAt,
        },
        tx
      );
    } catch (error) {
      /*
       * PostgreSQL unique constraint catches
       * concurrent duplicate invitations.
       */
      if (error.code === "P2002") {
        throw createInvitationError(
          "A pending invitation already exists for this email",
          COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_EXISTS,
          409
        );
      }

      throw error;
    }

    const frontendUrl =
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000";

    const invitationUrl = `${frontendUrl}/company/invitations/accept?token=${encodeURIComponent(
      rawToken
    )}`;

    await createEmailDelivery(
      {
        invitationId: invitation.id,
        recipientEmail: invitation.email,
        status: "PENDING",
      },
      tx
    );

    await createOutboxEvent(
      {
        eventType:
          COMPANY_OUTBOX_CONSTANTS.EVENT_TYPES.COMPANY_INVITATION_EMAIL,
        aggregateId: invitation.id,
        payload: {
          invitationId: invitation.id,
          email: invitation.email,
          companyName: company.name,
          inviterName: requester?.name || "",
          role: invitation.role,
          invitationUrl,
          expiresAt: invitation.expiresAt.toISOString(),
        },
      },
      tx
    );

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId: requesterUserId,
        action: AUDIT_ACTIONS.INVITATION_CREATED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_INVITATION,
        entityId: invitation.id,
        metadata: {
          invitedEmail: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
        },
        ...auditContext,
      },
      tx
    );

    return {
      invitation,
      rawToken,
    };
  });

  return {
    ...createCompanyInvitationDto(mapCompanyInvitation(result.invitation)),
    rawToken: result.rawToken,
  };
};

const acceptInvitation = async (userId, payload) => {
  const validatedData = acceptCompanyInvitationSchema.parse(payload);
  const tokenHash = hashInvitationToken(validatedData.token.trim());

  return prisma.$transaction(async (tx) => {
    const invitation =
      await companyInvitationRepository.findInvitationByTokenHash(
        tokenHash,
        tx
      );

    if (!invitation) {
      throw createInvitationError(
        "Invitation not found",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_NOT_FOUND,
        404
      );
    }

    const now = new Date();

    if (invitation.status === "ACCEPTED") {
      throw createInvitationError(
        "Invitation has already been accepted",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_ACCEPTED,
        409
      );
    }

    if (invitation.status === "REVOKED") {
      throw createInvitationError(
        "Invitation has been revoked",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_REVOKED,
        410
      );
    }

    if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
      if (invitation.status === "PENDING") {
        await companyInvitationRepository.markInvitationExpired(
          invitation.id,
          tx
        );
      }

      throw createInvitationError(
        "Invitation has expired",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EXPIRED,
        410
      );
    }

    const user = await companyRepository.findUserById(userId, tx);

    if (!user) {
      throw createInvitationError(
        "User not found",
        COMPANY_CONSTANTS.ERROR_CODES.COMPANY_MEMBER_NOT_FOUND,
        404
      );
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw createInvitationError(
        "Invitation email does not match your account",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EMAIL_MISMATCH,
        403
      );
    }

    const existingMember = await companyRepository.findMember(
      invitation.companyId,
      user.id,
      tx
    );

    if (existingMember) {
      await companyInvitationRepository.markInvitationAccepted(
        invitation.id,
        now,
        tx
      );

      return {
        alreadyMember: true,
        companyId: invitation.companyId,
        member: createCompanyMemberDto(mapCompanyMember(existingMember)),
      };
    }

    let member;

    try {
      member = await companyRepository.createMember(
        {
          companyId: invitation.companyId,
          userId: user.id,
          role: invitation.role,
        },
        tx
      );
    } catch (error) {
      if (error.code === "P2002") {
        throw createInvitationError(
          "User is already a member of this company",
          COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_EXISTS,
          409
        );
      }

      throw error;
    }

    await companyInvitationRepository.markInvitationAccepted(
      invitation.id,
      now,
      tx
    );

    await auditService.createAuditLog(
      {
        companyId: invitation.companyId,
        actorUserId: userId,
        action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_INVITATION,
        entityId: invitation.id,
        metadata: {
          role: invitation.role,
        },
        ...auditContext,
      },
      tx
    );

    return {
      alreadyMember: false,
      companyId: invitation.companyId,
      member: createCompanyMemberDto(mapCompanyMember(member)),
    };
  });
};

const revokeInvitation = async (
  companyId,
  requesterRole,
  invitationId,
  requesterUserId = null,
  auditContext = {}
) => {
  assertPermission(requesterRole, COMPANY_PERMISSIONS.INVITE_MEMBER);

  const invitation = await companyInvitationRepository.findInvitationById(
    invitationId
  );

  if (!invitation || invitation.companyId !== companyId) {
    const error = new Error("Invitation not found");
    error.code =
      COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_NOT_FOUND;
    error.statusCode = 404;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error("Only pending invitations can be revoked");
    error.code = COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_REVOKED;
    error.statusCode = 409;
    throw error;
  }

  const revokedInvitation = await prisma.$transaction(async (tx) => {
    const revoked = await companyInvitationRepository.markInvitationRevoked(
      invitation.id,
      tx
    );

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId: requesterUserId,
        action: AUDIT_ACTIONS.INVITATION_REVOKED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_INVITATION,
        entityId: invitationId,
        metadata: {
          role: invitation.role,
        },
        ...auditContext,
      },
      tx
    );

    return revoked;
  });

  return {
    id: revokedInvitation.id,
    email: revokedInvitation.email,
    role: revokedInvitation.role,
    status: revokedInvitation.status,
    expiresAt: revokedInvitation.expiresAt,
  };
};

const listInvitations = async (companyId, requesterRole, query = {}) => {
  assertPermission(requesterRole, COMPANY_PERMISSIONS.VIEW_MEMBERS);

  const validatedQuery = listCompanyInvitationsSchema.parse(query);
  const { page, limit, status } = validatedQuery;
  const skip = (page - 1) * limit;

  const [invitations, total] = await Promise.all([
    companyInvitationRepository.findInvitationsByCompany(companyId, {
      status,
      skip,
      take: limit,
    }),
    companyInvitationRepository.countInvitationsByCompany(companyId, {
      status,
    }),
  ]);

  return createCompanyInvitationListDto({
    invitations: invitations.map(mapCompanyInvitation),
    total,
    page,
    limit,
  });
};

module.exports = {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
};
