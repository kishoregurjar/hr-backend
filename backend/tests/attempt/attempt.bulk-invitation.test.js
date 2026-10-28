"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  createBulkInvitationSchema,
} = require("../../src/modules/attempt/attempt.validator");
const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const assessmentRepository = require("../../src/modules/assessment/assessment.repository");
const { prisma } = require("../../src/config/prisma");
const { BadRequestError } = require("../../src/common/errors");
const { BULK_INVITATION_ERROR_CODES } = require("../../src/modules/attempt/attempt.constants");

describe("Bulk Invitation Validation Suite", () => {
  it("should accept valid candidate list", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1", "candidate-2"],
    });

    assert.equal(result.success, true);
  });

  it("should reject duplicate candidate IDs", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1", "candidate-1"],
    });

    assert.equal(result.success, false);
  });

  it("should reject empty candidate list", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: [],
    });

    assert.equal(result.success, false);
  });

  it("should reject more than 500 candidates", () => {
    const candidateIds = Array.from(
      { length: 501 },
      (_, index) => `candidate-${index}`
    );

    const result = createBulkInvitationSchema.safeParse({
      candidateIds,
    });

    assert.equal(result.success, false);
  });

  it("should reject unknown properties", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1"],
      unknownField: "not-allowed",
    });

    assert.equal(result.success, false);
  });
});

describe("Bulk Invitation Service Regression Suite", () => {
  let origFindAssessmentById;
  let origFindCandidatesByIds;
  let origFindActiveInvitation;
  let origCreateInvitation;
  let origUpdateInvitationStatus;
  let origTransaction;
  let origFindManyCandidateProfile;
  let origCreateManyCandidateProfile;
  let origCreateManyCompanyCandidate;
  let origFindManyInvitation;
  let origUpdateAssessment;
  let origFindFirstCompanyMember;
  let origSetImmediate;
  let mockTx;

  beforeEach(() => {
    origFindAssessmentById = assessmentRepository.findById;
    origFindCandidatesByIds = attemptRepository.findCandidatesByIds;
    origFindActiveInvitation = attemptRepository.findActiveInvitation;
    origCreateInvitation = attemptRepository.createInvitation;
    origUpdateInvitationStatus = attemptRepository.updateInvitationStatus;
    origTransaction = prisma.$transaction;
    origFindManyCandidateProfile = prisma.candidateProfile.findMany;
    origCreateManyCandidateProfile = prisma.candidateProfile.createMany;
    origCreateManyCompanyCandidate = prisma.companyCandidate.createMany;
    origFindManyInvitation = prisma.invitation.findMany;
    origUpdateAssessment = prisma.assessment.update;
    origFindFirstCompanyMember = prisma.companyMember.findFirst;
    origSetImmediate = global.setImmediate;

    // Isolate email background job from hitting real DB
    global.setImmediate = () => {};
    attemptRepository.updateInvitationStatus = async () => ({});

    // Default mocks for batch operations
    prisma.candidateProfile.createMany = async () => ({ count: 0 });
    prisma.companyCandidate.createMany = async () => ({ count: 0 });
    prisma.invitation.findMany = async () => [];
    prisma.assessment.update = async () => ({});

    // Complete isolated mock transaction client
    mockTx = {
      candidateProfile: {
        findUnique: async () => null,
        findFirst: async ({ where }) => {
          const id = where.OR?.find((item) => item.id)?.id || "cp-default";
          return {
            id,
            email: "candidate@example.com",
            companyId: "company-zenpact",
          };
        },
        create: async ({ data }) => ({
          id: data.id || "cp-created-1",
          ...data,
        }),
        update: async ({ data }) => ({
          id: "cp-updated",
          ...data,
        }),
      },
      companyCandidate: {
        upsert: async () => ({}),
      },
      user: {
        findUnique: async () => null,
        create: async ({ data }) => ({
          id: "usr-created-1",
          ...data,
        }),
      },
    };

    prisma.$transaction = async (callback) => {
      if (typeof callback === "function") {
        return callback(mockTx);
      }
      return callback;
    };
  });

  afterEach(() => {
    assessmentRepository.findById = origFindAssessmentById;
    attemptRepository.findCandidatesByIds = origFindCandidatesByIds;
    attemptRepository.findActiveInvitation = origFindActiveInvitation;
    attemptRepository.createInvitation = origCreateInvitation;
    attemptRepository.updateInvitationStatus = origUpdateInvitationStatus;
    prisma.$transaction = origTransaction;
    prisma.candidateProfile.findMany = origFindManyCandidateProfile;
    prisma.candidateProfile.createMany = origCreateManyCandidateProfile;
    prisma.companyCandidate.createMany = origCreateManyCompanyCandidate;
    prisma.invitation.findMany = origFindManyInvitation;
    prisma.assessment.update = origUpdateAssessment;
    prisma.companyMember.findFirst = origFindFirstCompanyMember;
    global.setImmediate = origSetImmediate;
  });

  it("processes 4 selected candidates without duplicating entries even when redundant candidates array is sent (total: 4, created: 4, duplicate: 0, failed: 0)", async () => {
    const candidateIds = ["cand-1", "cand-2", "cand-3", "cand-4"];
    const candidates = [
      { candidateId: "cand-1", email: "cand1@example.com", firstName: "Cand", lastName: "One" },
      { candidateId: "cand-2", email: "cand2@example.com", firstName: "Cand", lastName: "Two" },
      { candidateId: "cand-3", email: "cand3@example.com", firstName: "Cand", lastName: "Three" },
      { candidateId: "cand-4", email: "cand4@example.com", firstName: "Cand", lastName: "Four" },
    ];

    assessmentRepository.findById = async () => ({
      id: "assessment-1",
      companyId: "company-zenpact",
      status: "PUBLISHED",
    });

    prisma.candidateProfile.findMany = async () => [
      { id: "cand-1", userId: "u-1", email: "cand1@example.com" },
      { id: "cand-2", userId: "u-2", email: "cand2@example.com" },
      { id: "cand-3", userId: null, email: "cand3@example.com" },
      { id: "cand-4", userId: null, email: "cand4@example.com" },
    ];

    attemptRepository.findCandidatesByIds = async (ids) =>
      ids.map((id, idx) => ({
        id,
        email: `cand${idx + 1}@example.com`,
        firstName: "Cand",
        lastName: `Num${idx + 1}`,
        status: "ACTIVE",
      }));

    mockTx.candidateProfile.findFirst = async ({ where }) => {
      const matchId = where.OR?.find((item) => item.id)?.id;
      return {
        id: matchId || "cand-resolved",
        email: "cand@example.com",
        companyId: "company-zenpact",
      };
    };

    attemptRepository.findActiveInvitation = async () => null;

    let createdCount = 0;
    attemptRepository.createInvitation = async (data) => {
      createdCount++;
      return {
        id: `inv-${createdCount}`,
        assessmentId: data.assessmentId,
        candidateId: data.candidateId,
        status: "PENDING",
        expiresAt: data.expiresAt,
      };
    };

    const response = await attemptService.createBulkInvitations({
      assessmentId: "assessment-1",
      candidateIds,
      candidates,
      invitedByUserId: "hr-user-1",
    });

    assert.equal(response.summary.total, 4, "total should be exactly 4, not 8");
    assert.equal(response.summary.created, 4, "created should be 4");
    assert.equal(response.summary.duplicate, 0, "duplicate should be 0");
    assert.equal(response.summary.failed, 0, "failed should be 0");
    assert.equal(response.results.length, 4);
    assert.equal(createdCount, 4);
  });

  it("handles repeating invitations on the same 4 candidates returning duplicate: 4 (total: 4, created: 0, duplicate: 4, failed: 0)", async () => {
    const candidateIds = ["cand-1", "cand-2", "cand-3", "cand-4"];

    assessmentRepository.findById = async () => ({
      id: "assessment-1",
      companyId: "company-zenpact",
      status: "PUBLISHED",
    });

    attemptRepository.findCandidatesByIds = async (ids) =>
      ids.map((id, idx) => ({
        id,
        email: `cand${idx + 1}@example.com`,
        status: "ACTIVE",
      }));

    prisma.candidateProfile.findMany = async () =>
      candidateIds.map((id, idx) => ({
        id,
        email: `cand${idx + 1}@example.com`,
        companyId: "company-zenpact",
      }));

    // Batch query for active invitations returns all 4 as duplicate
    prisma.invitation.findMany = async () =>
      candidateIds.map((id) => ({
        id: `existing-inv-${id}`,
        candidateId: id,
      }));

    const response = await attemptService.createBulkInvitations({
      assessmentId: "assessment-1",
      candidateIds,
      invitedByUserId: "hr-user-1",
    });

    assert.equal(response.summary.total, 4);
    assert.equal(response.summary.created, 0);
    assert.equal(response.summary.duplicate, 4);
    assert.equal(response.summary.failed, 0);
    assert.equal(response.results.every((r) => r.status === "DUPLICATE"), true);
  });

  it("preserves ad-hoc/email-only invitations without existing candidateIds (total: 1, created: 1)", async () => {
    assessmentRepository.findById = async () => ({
      id: "assessment-1",
      companyId: "company-zenpact",
      status: "PUBLISHED",
    });

    mockTx.candidateProfile.findUnique = async () => null;
    mockTx.user.findUnique = async () => null;
    mockTx.user.create = async ({ data }) => ({ id: "new-user-1", ...data });
    mockTx.candidateProfile.create = async ({ data }) => ({ id: "new-cand-profile-1", ...data });

    attemptRepository.findCandidatesByIds = async () => [
      {
        id: "new-cand-profile-1",
        email: "adhoc@example.com",
        firstName: "Ad",
        lastName: "Hoc",
        status: "ACTIVE",
      },
    ];

    prisma.candidateProfile.findMany = async () => [
      {
        id: "new-cand-profile-1",
        email: "adhoc@example.com",
        firstName: "Ad",
        lastName: "Hoc",
        companyId: "company-zenpact",
      },
    ];

    attemptRepository.findActiveInvitation = async () => null;
    attemptRepository.createInvitation = async (data) => ({
      id: "inv-adhoc",
      candidateId: data.candidateId,
      status: "PENDING",
      expiresAt: data.expiresAt,
    });

    const response = await attemptService.createBulkInvitations({
      assessmentId: "assessment-1",
      candidates: [
        { email: "adhoc@example.com", firstName: "Ad", lastName: "Hoc" },
      ],
      invitedByUserId: "hr-user-1",
    });

    assert.equal(response.summary.total, 1);
    assert.equal(response.summary.created, 1);
    assert.equal(response.summary.duplicate, 0);
    assert.equal(response.summary.failed, 0);
  });

  it("handles mixed inputs retaining correct per-candidate status (created: 1, duplicate: 1, failed: 1)", async () => {
    const candidateIds = ["cand-ok", "cand-dup", "cand-inactive"];

    assessmentRepository.findById = async () => ({
      id: "assessment-1",
      companyId: "company-zenpact",
      status: "PUBLISHED",
    });

    attemptRepository.findCandidatesByIds = async () => [
      { id: "cand-ok", email: "ok@example.com", status: "ACTIVE" },
      { id: "cand-dup", email: "dup@example.com", status: "ACTIVE" },
      { id: "cand-inactive", email: "inactive@example.com", status: "INACTIVE" },
    ];

    prisma.candidateProfile.findMany = async () => [
      { id: "cand-ok", email: "ok@example.com", companyId: "company-zenpact" },
      { id: "cand-dup", email: "dup@example.com", companyId: "company-zenpact" },
      { id: "cand-inactive", email: "inactive@example.com", companyId: "company-zenpact" },
    ];

    prisma.invitation.findMany = async () => [
      { id: "inv-dup", candidateId: "cand-dup" },
    ];

    attemptRepository.createInvitation = async (data) => ({
      id: `inv-${data.candidateId}`,
      candidateId: data.candidateId,
      status: "PENDING",
      expiresAt: data.expiresAt,
    });

    const response = await attemptService.createBulkInvitations({
      assessmentId: "assessment-1",
      candidateIds,
      invitedByUserId: "hr-user-1",
    });

    assert.equal(response.summary.total, 3);
    assert.equal(response.summary.created, 1);
    assert.equal(response.summary.duplicate, 1);
    assert.equal(response.summary.failed, 1);

    const statusMap = new Map(response.results.map((r) => [r.candidateId, r.status]));
    assert.equal(statusMap.get("cand-ok"), "CREATED");
    assert.equal(statusMap.get("cand-dup"), "DUPLICATE");
    assert.equal(statusMap.get("cand-inactive"), "FAILED");
  });

  it("preserves cross-company membership isolation and attaches effectiveCompanyId", async () => {
    let companyCandidateCreated = null;

    assessmentRepository.findById = async () => ({
      id: "assessment-1",
      companyId: "company-target-123",
      status: "PUBLISHED",
    });

    prisma.candidateProfile.findMany = async () => [
      { id: "cand-cross", email: "cross@example.com", companyId: null },
    ];
    attemptRepository.findCandidatesByIds = async (ids) => [
      { id: ids[0], email: "cross@example.com", status: "ACTIVE" },
    ];

    prisma.companyCandidate.createMany = async ({ data }) => {
      companyCandidateCreated = data[0];
      return { count: data.length };
    };

    attemptRepository.findActiveInvitation = async () => null;
    attemptRepository.createInvitation = async (data) => ({
      id: "inv-cross",
      candidateId: data.candidateId,
      status: "PENDING",
      expiresAt: data.expiresAt,
    });

    const response = await attemptService.createBulkInvitations({
      assessmentId: "assessment-1",
      candidateIds: ["cand-cross"],
      invitedByUserId: "hr-user-1",
    });

    assert.equal(response.summary.total, 1);
    assert.equal(response.summary.created, 1);
    assert.equal(companyCandidateCreated.companyId, "company-target-123");
    assert.equal(companyCandidateCreated.candidateId, "cand-cross");
  });

  it("rejects duplicate candidate IDs in candidateIds array with DUPLICATE_CANDIDATE_IDS error", async () => {
    await assert.rejects(
      () =>
        attemptService.createBulkInvitations({
          assessmentId: "assessment-1",
          candidateIds: ["dup-1", "dup-1"],
          invitedByUserId: "hr-user-1",
        }),
      (err) =>
        err instanceof BadRequestError &&
        err.code === BULK_INVITATION_ERROR_CODES.DUPLICATE_CANDIDATE_IDS
    );
  });
});
