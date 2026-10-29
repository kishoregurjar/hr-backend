"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const { prisma } = require("../../src/config/prisma");

describe("Candidate Multi-Tenant Invitation & Status Isolation Suite", () => {
  let origFindManyProfile;
  let origCountProfile;
  let origFindFirstMember;

  const mockProfiles = [
    {
      id: "cand_shared_01",
      email: "rohitpanchal@example.com",
      firstName: "Rohit",
      lastName: "Panchal",
      companyId: "comp_microsoft",
      metadata: {},
      companyCandidates: [
        { companyId: "comp_microsoft", candidateId: "cand_shared_01" },
        { companyId: "comp_oracle", candidateId: "cand_shared_01" },
      ],
      invitations: [
        {
          id: "inv_ms_01",
          status: "INVITED",
          sentAt: new Date("2026-10-29T10:00:00.000Z"),
          assessment: {
            id: "asmt_ms_01",
            title: "Microsoft Assessment",
            createdById: "user_ms_hr",
            createdBy: {
              companyMembers: [{ companyId: "comp_microsoft" }],
            },
          },
        },
      ],
      attempts: [
        {
          id: "att_ms_01",
          status: "SUBMITTED",
          startedAt: new Date("2026-10-29T11:00:00.000Z"),
          assessment: {
            id: "asmt_ms_01",
            title: "Microsoft Assessment",
            createdById: "user_ms_hr",
            createdBy: {
              companyMembers: [{ companyId: "comp_microsoft" }],
            },
          },
        },
      ],
    },
    {
      id: "cand_oracle_only",
      email: "oracle_only@example.com",
      firstName: "Oracle",
      lastName: "Candidate",
      companyId: "comp_oracle",
      metadata: {},
      companyCandidates: [
        { companyId: "comp_oracle", candidateId: "cand_oracle_only" },
      ],
      invitations: [
        {
          id: "inv_ora_01",
          status: "INVITED",
          sentAt: new Date("2026-10-29T12:00:00.000Z"),
          assessment: {
            id: "asmt_ora_01",
            title: "Oracle Assessment",
            createdById: "user_ora_hr",
            createdBy: {
              companyMembers: [{ companyId: "comp_oracle" }],
            },
          },
        },
      ],
      attempts: [],
    },
    {
      id: "cand_uninvited_shared",
      email: "uninvited@example.com",
      firstName: "Uninvited",
      lastName: "Candidate",
      companyId: "comp_gamma",
      metadata: {},
      companyCandidates: [
        { companyId: "comp_gamma", candidateId: "cand_uninvited_shared" },
        { companyId: "comp_oracle", candidateId: "cand_uninvited_shared" },
      ],
      invitations: [
        {
          id: "inv_gamma_01",
          status: "INVITED",
          sentAt: new Date("2026-10-29T09:00:00.000Z"),
          assessment: {
            id: "asmt_gamma_01",
            title: "Gamma Assessment",
            createdById: "user_gamma_hr",
            createdBy: {
              companyMembers: [{ companyId: "comp_gamma" }],
            },
          },
        },
      ],
      attempts: [],
    },
  ];

  beforeEach(() => {
    attemptService.clearCandidatesCache();

    origFindManyProfile = prisma.candidateProfile.findMany;
    origCountProfile = prisma.candidateProfile.count;
    origFindFirstMember = prisma.companyMember.findFirst;

    prisma.candidateProfile.findMany = async (args) => {
      const { where, select } = args;
      const targetCompany = select?.invitations?.where?.assessment?.createdBy?.companyMembers?.some?.companyId || null;

      // Filter profiles matching where.OR
      return mockProfiles
        .filter((p) => {
          if (!where?.OR && !where?.AND) return true;
          const orConditions = where?.OR || (where?.AND ? where.AND[0]?.OR : null);
          if (!orConditions) return true;
          return orConditions.some((c) => {
            if (c.companyId && p.companyId === c.companyId) return true;
            if (c.companyCandidates?.some?.companyId) {
              const reqCId = c.companyCandidates.some.companyId;
              return p.companyCandidates.some((cc) => cc.companyId === reqCId);
            }
            return false;
          });
        })
        .map((p) => {
          // Scope invitations and attempts by targetCompany
          const scopedInvs = p.invitations.filter((inv) => {
            if (!targetCompany) return true;
            return inv.assessment?.createdBy?.companyMembers?.some((m) => m.companyId === targetCompany);
          });
          const scopedAtts = p.attempts.filter((att) => {
            if (!targetCompany) return true;
            return att.assessment?.createdBy?.companyMembers?.some((m) => m.companyId === targetCompany);
          });

          return {
            id: p.id,
            email: p.email,
            firstName: p.firstName,
            lastName: p.lastName,
            phoneNumber: p.phoneNumber || null,
            metadata: p.metadata,
            companyId: p.companyId,
            company: { id: p.companyId, name: p.companyId },
            createdAt: new Date(),
            updatedAt: new Date(),
            invitations: select?.invitations ? scopedInvs.slice(0, 1) : [],
            attempts: select?.attempts ? scopedAtts.slice(0, 1) : [],
          };
        });
    };

    prisma.candidateProfile.count = async () => mockProfiles.length;
  });

  afterEach(() => {
    prisma.candidateProfile.findMany = origFindManyProfile;
    prisma.candidateProfile.count = origCountProfile;
    prisma.companyMember.findFirst = origFindFirstMember;
    attemptService.clearCandidatesCache();
  });

  it("1. A Microsoft invitation does NOT make the candidate INVITED in Oracle", async () => {
    prisma.companyMember.findFirst = async () => ({ companyId: "comp_oracle" });

    const result = await attemptService.getCandidates({
      user: { id: "user_ora_hr", role: "HR" },
      companyId: "comp_oracle",
    });

    const sharedCandidate = result.items.find((c) => c.id === "cand_shared_01");
    assert.ok(sharedCandidate, "Shared candidate must be visible to Oracle");
    assert.equal(sharedCandidate.status, "NEW", "Candidate must be NEW for Oracle since Oracle never invited them");
    assert.equal(sharedCandidate.invitation, null, "Oracle must NOT receive Microsoft's invitation details");
    assert.equal(sharedCandidate.attempt, null, "Oracle must NOT receive Microsoft's attempt details");
  });

  it("2. An Oracle invitation correctly makes the candidate INVITED in Oracle", async () => {
    prisma.companyMember.findFirst = async () => ({ companyId: "comp_oracle" });

    const result = await attemptService.getCandidates({
      user: { id: "user_ora_hr", role: "HR" },
      companyId: "comp_oracle",
    });

    const oracleCandidate = result.items.find((c) => c.id === "cand_oracle_only");
    assert.ok(oracleCandidate, "Oracle candidate must be visible");
    assert.equal(oracleCandidate.status, "INVITED", "Oracle candidate must show INVITED status");
    assert.ok(oracleCandidate.invitation, "Oracle candidate must include Oracle's invitation");
    assert.equal(oracleCandidate.invitation.assessment.title, "Oracle Assessment");
  });

  it("3. Microsoft still sees its own invitation and attempt status", async () => {
    prisma.companyMember.findFirst = async () => ({ companyId: "comp_microsoft" });

    const result = await attemptService.getCandidates({
      user: { id: "user_ms_hr", role: "HR" },
      companyId: "comp_microsoft",
    });

    const sharedCandidate = result.items.find((c) => c.id === "cand_shared_01");
    assert.ok(sharedCandidate, "Shared candidate must be visible to Microsoft");
    assert.equal(sharedCandidate.status, "SUBMITTED", "Microsoft must see the attempt status (SUBMITTED)");
    assert.ok(sharedCandidate.invitation, "Microsoft must receive its invitation record");
    assert.equal(sharedCandidate.invitation.assessment.title, "Microsoft Assessment");
    assert.ok(sharedCandidate.attempt, "Microsoft must receive its attempt record");
  });

  it("4. Candidates without an invitation in the current tenant do NOT inherit another tenant's status", async () => {
    prisma.companyMember.findFirst = async () => ({ companyId: "comp_oracle" });

    const result = await attemptService.getCandidates({
      user: { id: "user_ora_hr", role: "HR" },
      companyId: "comp_oracle",
    });

    const uninvitedInOracle = result.items.find((c) => c.id === "cand_uninvited_shared");
    assert.ok(uninvitedInOracle, "Candidate shared with Oracle must be visible");
    assert.equal(uninvitedInOracle.status, "NEW", "Status must be NEW in Oracle despite Gamma invitation");
    assert.equal(uninvitedInOracle.invitation, null);
    assert.equal(uninvitedInOracle.attempt, null);
  });

  it("5. Candidate profiles and invitations for unrelated tenants remain unchanged", async () => {
    prisma.companyMember.findFirst = async () => ({ companyId: "comp_gamma" });

    const result = await attemptService.getCandidates({
      user: { id: "user_gamma_hr", role: "HR" },
      companyId: "comp_gamma",
    });

    const gammaCandidate = result.items.find((c) => c.id === "cand_uninvited_shared");
    assert.ok(gammaCandidate, "Gamma must see its candidate");
    assert.equal(gammaCandidate.status, "INVITED", "Gamma must see INVITED status for its candidate");
    assert.equal(gammaCandidate.invitation.assessment.title, "Gamma Assessment");

    // Microsoft candidate should NOT be visible to Gamma
    const msCandidateInGamma = result.items.find((c) => c.id === "cand_shared_01");
    assert.equal(msCandidateInGamma, undefined, "Gamma must not see candidates not shared with Gamma");
  });
});

