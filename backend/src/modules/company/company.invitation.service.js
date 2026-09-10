"use strict";

const crypto = require("crypto");
const env = require("../../config/env");
const { prisma } = require("../../config/prisma");
const { runSerializableTransaction } = require("../../utils/prisma-transaction");
const { encryptToken } = require("../../utils/token-crypto");

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
const authRepository = require("../auth/auth.repository");

const {
  createCompanyInvitationSchema,
  acceptCompanyInvitationSchema,
  acceptAndRegisterCompanyInvitationSchema,
  listCompanyInvitationsSchema,
} = require("./company.invitation.validator");

const {
  createCompanyInvitationDto,
  createCompanyInvitationListDto,
} = require("./company.invitation.dto");

const { createCompanyMemberDto } = require("./company.dto");

const { mapCompanyInvitation } = require("./company.invitation.mapper");
const { mapCompanyMember } = require("./company.mapper");

const { AppError } = require("../../utils/app-error");

// Auth utilities — imported once at module load, NOT inside functions
const {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken: hashJwtToken,
  setRefreshTokenCookie,
} = require("../auth/auth.utils");

const createInvitationError = (message, code, statusCode) => {
  return new AppError(message, {
    statusCode: statusCode || 400,
    code: code || "INVITATION_ERROR",
    isOperational: true,
  });
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

      let invitation;

      if (existingInvitation) {
        invitation = await tx.companyInvitation.update({
          where: { id: existingInvitation.id },
          data: {
            role: validatedData.role,
            tokenHash,
            encryptedToken,
            status: "PENDING",
            expiresAt,
          },
        });
      } else {
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
            invitation = await tx.companyInvitation.findFirst({
              where: { companyId, email },
            });
            if (invitation) {
              invitation = await tx.companyInvitation.update({
                where: { id: invitation.id },
                data: {
                  role: validatedData.role,
                  tokenHash,
                  encryptedToken,
                  status: "PENDING",
                  expiresAt,
                },
              });
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      const frontendUrl = env.frontend.url;

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

const verifyInvitationToken = async (rawToken) => {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    throw createInvitationError(
      "Invitation token is required",
      COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_TOKEN_REQUIRED || "INVITATION_TOKEN_REQUIRED",
      400
    );
  }

  const tokenHash = hashInvitationToken(rawToken.trim());
  const invitation = await companyInvitationRepository.findInvitationByTokenHash(tokenHash);

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
    throw createInvitationError(
      "Invitation has expired",
      COMPANY_INVITATION_CONSTANTS.ERROR_CODES.INVITATION_EXPIRED,
      410
    );
  }

  const company = await companyRepository.findCompanyById(invitation.companyId);
  const existingUser = await companyRepository.findUserByEmail(invitation.email);

  return {
    invitationId: invitation.id,
    companyId: invitation.companyId,
    companyName: company ? company.name : "Company",
    companySlug: company ? company.slug : null,
    companyLogoUrl: company ? company.logoUrl : null,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    isExistingUser: Boolean(existingUser),
  };
};

const acceptAndRegisterInvitation = async (payload, auditContext = {}) => {
  const validatedData = acceptAndRegisterCompanyInvitationSchema.parse(payload);
  const rawToken = validatedData.token.trim();
  const tokenHash = hashInvitationToken(rawToken);

  return runSerializableTransaction(prisma, async (tx) => {
    // ── Step 1: Validate invitation ──────────────────────────────────────────
    const invitation = await companyInvitationRepository.findInvitationByTokenHash(
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

    // ── Step 2: Find or create user ──────────────────────────────────────────
    // User schema fields: id, email, password, name, role, status
    // (No firstName, lastName, tokenVersion in this schema)
    const USER_SELECT = {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    };

    const email = invitation.email.toLowerCase().trim();

    // Check if user already exists in DB (transactional read)
    let user = await tx.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });

    const isNewUser = !user;

    if (isNewUser) {
      const hashedPassword = await hashPassword(validatedData.password);
      const fullName = validatedData.name.trim();

      user = await tx.user.create({
        data: {
          email,
          name: fullName,
          password: hashedPassword,
          status: "ACTIVE",
          role: "HR",
        },
        select: USER_SELECT,
      });
    }

    // ── Step 3: Find or create company membership ────────────────────────────
    const existingMember = await companyRepository.findMember(
      invitation.companyId,
      user.id,
      tx
    );

    let member = existingMember;

    if (!existingMember) {
      member = await companyRepository.createMember(
        {
          companyId: invitation.companyId,
          userId: user.id,
          role: invitation.role,
        },
        tx
      );
    }

    // ── Step 4: Mark invitation as accepted (token consumed) ─────────────────
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

    // ── Step 5: Audit log ────────────────────────────────────────────────────
    await auditService.createAuditLog(
      {
        companyId: invitation.companyId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
        entityType: AUDIT_ENTITY_TYPES.COMPANY_INVITATION,
        entityId: invitation.id,
        metadata: {
          role: invitation.role,
          registrationMode: isNewUser ? "IN_PLACE_ONBOARDING" : "EXISTING_USER",
        },
        ...auditContext,
      },
      tx
    );

    // ── Step 6: Generate JWT tokens ──────────────────────────────────────────
    // user object has: { id, email, name, role, status }
    // generateAccessToken uses: user.id (sub), user.email, user.role, user.tokenVersion (?? 0)
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // ── Step 7: Persist refresh token (only if RefreshToken model exists) ────
    // authRepository.createRefreshToken detects tx via db.refreshToken presence.
    // Our schema does NOT have a RefreshToken model, so we skip persisting.
    // This is safe — tokens are stateless JWTs. For a session-based revocation
    // system, add model RefreshToken to schema.prisma and re-enable below.
    //
    // await authRepository.createRefreshToken(tx, {
    //   userId: user.id,
    //   token: hashJwtToken(refreshToken),
    //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    // });

    // ── Step 8: Fetch company info for response ──────────────────────────────
    const company = await companyRepository.findCompanyById(
      invitation.companyId,
      tx
    );

    return {
      accessToken,
      refreshToken,
      isNewUser,
      alreadyMember: Boolean(existingMember),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      company: {
        id: company ? company.id : invitation.companyId,
        name: company ? company.name : "Company",
        slug: company ? company.slug : null,
      },
      member: createCompanyMemberDto(mapCompanyMember(member)),
    };
  });
};

module.exports = {
  createInvitation,
  verifyInvitationToken,
  acceptInvitation,
  acceptAndRegisterInvitation,
  revokeInvitation,
  listInvitations,
  generateInvitationToken,
  hashInvitationToken,
  expirePendingInvitations,
};
