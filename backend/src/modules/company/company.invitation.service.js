"use strict";

const crypto = require("crypto");
const { prisma } = require("../../config/prisma");
const { runSerializableTransaction } = require("../../utils/prisma-transaction");
const { encryptToken, decryptToken } = require("../../utils/token-crypto");

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
} = require("./company.invitation.dto");

const { createCompanyMemberDto } = require("./company.dto");

const { mapCompanyInvitation } = require("./company.invitation.mapper");
const { mapCompanyMember } = require("./company.mapper");

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
    expiresAt.getDate() + COMPANY_INVITATION_CONSTANTS.TOKEN.EXPIRATION_DAYS
  );
  return expiresAt;
};

const createInvitation = async (
  companyIdOrOptions,
  requesterRoleArg,
  requesterUserIdArg,
  payloadArg,
  auditContextArg = {}
) => {
  const options =
    typeof companyIdOrOptions === "object" && companyIdOrOptions !== null
      ? companyIdOrOptions
      : {
          companyId: companyIdOrOptions,
          actorRole: requesterRoleArg,
          actorUserId: requesterUserIdArg,
          payload: payloadArg,
          auditContext: auditContextArg,
        };

  const {
    companyId,
    actorRole = requesterRoleArg,
    actorUserId = requesterUserIdArg,
    payload = payloadArg,
    auditContext = auditContextArg,
  } = options;

  assertPermission(actorRole, COMPANY_PERMISSIONS.INVITE_MEMBER);

  const validatedData = createCompanyInvitationSchema.parse(payload);
  const email = validatedData.email.trim().toLowerCase();

  if (validatedData.role === "OWNER") {
    throw createInvitationError(
      "Cannot invite a member as OWNER",
      "COMPANY_INVITATION_INVALID_ROLE",
      400
    );
  }

  const company = await companyRepository.findCompanyById(companyId);

  if (!company) {
    throw createInvitationError(
      "Company not found",
      COMPANY_CONSTANTS.ERROR_CODES.COMPANY_NOT_FOUND,
      404
    );
  }

  const requester = await companyRepository.findUserById(actorUserId);

  const existingUser = await companyRepository.findUserByEmail(email);

  if (existingUser && existingUser.id === actorUserId) {
    throw createInvitationError(
      "You cannot invite yourself to the company",
      COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_SELF,
      409
    );
  }

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const encryptedToken = encryptToken(rawToken);
  const expiresAt = calculateExpirationDate();

  try {
    const result = await runSerializableTransaction(prisma, async (tx) => {
      await companyInvitationRepository.expirePendingInvitations(
        companyId,
        new Date(),
        tx
      );

      const existingMember =
        await companyInvitationRepository.findCompanyMemberByEmail(
          companyId,
          email,
          tx
        );

      if (existingMember) {
        throw createInvitationError(
          "User is already a member of this company",
          COMPANY_INVITATION_CONSTANTS.ERROR_CODES.MEMBER_ALREADY_EXISTS,
          409
        );
      }

      const existingInvitation =
        await companyInvitationRepository.findPendingInvitation(
          companyId,
          email,
          tx
        );

      if (existingInvitation) {
        throw createInvitationError(
          "A pending invitation already exists for this email",
          COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EMAIL_ALREADY_PENDING,
          409
        );
      }

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

      let invitation;

      try {
        invitation = await companyInvitationRepository.createInvitation(
          {
            companyId,
            email,
            role: validatedData.role,
            tokenHash,
            encryptedToken,
            status: "PENDING",
            expiresAt,
          },
          tx
        );
      } catch (error) {
        if (error.code === "P2002") {
          throw createInvitationError(
            "A pending invitation already exists for this email",
            COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EMAIL_ALREADY_PENDING,
            409
          );
        }
        throw error;
      }

      const frontendUrl =
        process.env.CLIENT_URL ||
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const invitationUrl = `${frontendUrl}/accept-invitation?invitation=${invitation.id}&token=${encodeURIComponent(
        rawToken
      )}`;

      const emailDelivery = await createEmailDelivery(
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
            emailDeliveryId: emailDelivery.id,
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
          actorUserId: actorUserId,
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
  } catch (error) {
    if (error.code === "P2002") {
      throw createInvitationError(
        "A pending invitation already exists for this email",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EMAIL_ALREADY_PENDING,
        409
      );
    }
    throw error;
  }
};

const acceptInvitation = async (
  userIdOrOptions,
  payloadArg,
  auditContextArg = {}
) => {
  const options =
    typeof userIdOrOptions === "object" && userIdOrOptions !== null
      ? userIdOrOptions
      : {
          userId: userIdOrOptions,
          payload: payloadArg,
          auditContext: auditContextArg,
        };

  const {
    userId,
    payload = payloadArg,
    auditContext = auditContextArg,
  } = options;

  const validatedData = acceptCompanyInvitationSchema.parse(payload);
  const rawToken = validatedData.token.trim();
  const tokenHash = hashInvitationToken(rawToken);

  return runSerializableTransaction(prisma, async (tx) => {
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
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_REVOKED,
        409
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
        "Invitation email does not match your logged in account email",
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
      const consumedHash = hashInvitationToken(
        `${invitation.id}:${crypto.randomUUID()}`
      );
      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          tokenHash: consumedHash,
          encryptedToken: "",
        },
      });

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
          COMPANY_INVITATION_CONSTANTS.ERROR_CODES.MEMBER_ALREADY_EXISTS,
          409
        );
      }
      throw error;
    }

    const consumedHash = hashInvitationToken(
      `${invitation.id}:${crypto.randomUUID()}`
    );

    await tx.companyInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: now,
        tokenHash: consumedHash,
        encryptedToken: "",
      },
    });

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
  companyIdOrOptions,
  requesterRoleArg,
  invitationIdArg,
  requesterUserIdArg = null,
  auditContextArg = {}
) => {
  const options =
    typeof companyIdOrOptions === "object" && companyIdOrOptions !== null
      ? companyIdOrOptions
      : {
          companyId: companyIdOrOptions,
          actorRole: requesterRoleArg,
          invitationId: invitationIdArg,
          actorUserId: requesterUserIdArg,
          auditContext: auditContextArg,
        };

  const {
    companyId,
    actorRole = requesterRoleArg,
    invitationId = invitationIdArg,
    actorUserId = requesterUserIdArg,
    auditContext = auditContextArg,
  } = options;

  assertPermission(actorRole, COMPANY_PERMISSIONS.INVITE_MEMBER);

  return runSerializableTransaction(prisma, async (tx) => {
    const invitation = await companyInvitationRepository.findInvitationById(
      invitationId,
      tx
    );

    if (!invitation || invitation.companyId !== companyId) {
      throw createInvitationError(
        "Invitation not found",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_NOT_FOUND,
        404
      );
    }

    if (invitation.status === "ACCEPTED") {
      throw createInvitationError(
        "Invitation has already been accepted",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_ACCEPTED,
        409
      );
    }

    if (invitation.status === "REVOKED") {
      throw createInvitationError(
        "Invitation has already been revoked",
        COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_ALREADY_REVOKED,
        409
      );
    }

    const consumedHash = hashInvitationToken(
      `${invitation.id}:${crypto.randomUUID()}`
    );

    const revoked = await tx.companyInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: "REVOKED",
        tokenHash: consumedHash,
        encryptedToken: "",
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    await auditService.createAuditLog(
      {
        companyId,
        actorUserId,
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

/**
 * Expire pending invitations whose expiresAt has passed.
 * Uses updateMany with status: 'PENDING' condition to be safe
 * in case of race with concurrent accept requests.
 */
const expirePendingInvitations = async () => {
  const now = new Date();

  const invitations = await prisma.companyInvitation.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
    take: 500,
  });

  if (!invitations.length) {
    return 0;
  }

  let updatedCount = 0;

  for (const invitation of invitations) {
    const result = await prisma.companyInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        encryptedToken: "",
      },
    });

    updatedCount += result.count;
  }

  return updatedCount;
};

module.exports = {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
  generateInvitationToken,
  hashInvitationToken,
  expirePendingInvitations,
};
