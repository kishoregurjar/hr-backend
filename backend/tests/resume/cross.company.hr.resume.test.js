"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  createCandidateIfRequired,
} = require("../../src/modules/resume/resume.service");
const repository = require("../../src/modules/resume/resume.repository");

describe("Cross-Company HR Resume Ingestion & Role Isolation Suite", () => {
  const TARGET_COMPANY_ID = "cmvqkgij6009orfbo8xj7zkzt"; // Facebook Company
  const OTHER_COMPANY_ID = "cmvqjiw5r0000rfbofwe6fors"; // Microsoft IT Company

  let origFindCandidate;
  let origCreateCandidate;
  let origEnsureProfile;

  let createdUserPayload = null;
  let ensuredCandidateProfile = null;
  let capturedTargetCompanyId = null;
  let existingUsersDb = new Map();
  let candidateProfilesDb = new Map();
  let companyCandidatesDb = [];

  beforeEach(() => {
    origFindCandidate = repository.findCandidateByEmail;
    origCreateCandidate = repository.createCandidate;
    origEnsureProfile = repository.ensureCandidateProfile;

    createdUserPayload = null;
    ensuredCandidateProfile = null;
    capturedTargetCompanyId = null;
    existingUsersDb.clear();
    candidateProfilesDb.clear();
    companyCandidatesDb = [];

    // Mock findCandidateByEmail using in-memory store
    repository.findCandidateByEmail = async (email) => {
      if (!email) return null;
      return existingUsersDb.get(email.toLowerCase().trim()) || null;
    };

    // Mock createCandidate
    repository.createCandidate = async (data) => {
      createdUserPayload = data;
      const newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ...data,
        companyMembers: [],
      };
      existingUsersDb.set(newUser.email.toLowerCase().trim(), newUser);
      return newUser;
    };

    // Mock ensureCandidateProfile following exact repository behavior
    repository.ensureCandidateProfile = async (user, extractedData, companyId) => {
      capturedTargetCompanyId = companyId;
      const email = user.email.toLowerCase().trim();

      let profile = candidateProfilesDb.get(email);
      if (!profile) {
        profile = {
          id: `cprof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: user.id,
          companyId: companyId || null,
          email,
          firstName: extractedData?.name ? extractedData.name.split(" ")[0] : "Candidate",
          lastName: extractedData?.name ? extractedData.name.split(" ").slice(1).join(" ") : "",
          metadata: { ...extractedData },
        };
        candidateProfilesDb.set(email, profile);
      } else {
        // If existing profile has no companyId and target companyId is provided, set it
        if (!profile.companyId && companyId) {
          profile.companyId = companyId;
        }
        // Preserve original companyId if already set
      }

      if (companyId) {
        const existingLink = companyCandidatesDb.find(
          (cc) => cc.companyId === companyId && cc.candidateId === profile.id
        );
        if (!existingLink) {
          companyCandidatesDb.push({
            companyId,
            candidateId: profile.id,
          });
        }
      }

      ensuredCandidateProfile = profile;
      return profile;
    };
  });

  afterEach(() => {
    repository.findCandidateByEmail = origFindCandidate;
    repository.createCandidate = origCreateCandidate;
    repository.ensureCandidateProfile = origEnsureProfile;
  });

  it("allows sender who is HR owner in another company to submit resume to target company", async () => {
    // Rohit Panchal is an HR Owner of Microsoft IT Company
    const rohitUser = {
      id: "rohit_user_id_123",
      email: "rohitpanchal958466@gmail.com",
      name: "Rohit Panchal",
      role: "HR",
      status: "ACTIVE",
      companyMembers: [
        {
          companyId: OTHER_COMPANY_ID,
          role: "OWNER",
        },
      ],
    };
    existingUsersDb.set(rohitUser.email, rohitUser);

    const result = await createCandidateIfRequired({
      extractedData: {
        name: "Rohit Panchal",
        email: "rohitpanchal958466@gmail.com",
        skills: ["Node.js", "Express", "PostgreSQL"],
      },
      sourceEmail: "rohitpanchal958466@gmail.com",
      companyId: TARGET_COMPANY_ID, // Facebook Company
      source: "INBOUND_EMAIL",
    });

    assert.ok(result);
    assert.equal(result.created, false);
    assert.equal(result.candidate.id, "rohit_user_id_123");
    assert.equal(result.candidate.email, "rohitpanchal958466@gmail.com");

    // 1. User role remains HR (NOT downgraded to CANDIDATE)
    assert.equal(result.candidate.role, "HR");
    assert.equal(existingUsersDb.get("rohitpanchal958466@gmail.com").role, "HR");

    // 2. Microsoft IT Company membership remains unchanged
    assert.equal(result.candidate.companyMembers.length, 1);
    assert.equal(result.candidate.companyMembers[0].companyId, OTHER_COMPANY_ID);
    assert.equal(result.candidate.companyMembers[0].role, "OWNER");

    // 3. No duplicate User record created
    assert.equal(createdUserPayload, null);

    // 4. Target company (Facebook Company) receives its candidate profile and companyCandidate association
    assert.equal(capturedTargetCompanyId, TARGET_COMPANY_ID);
    assert.ok(ensuredCandidateProfile);
    assert.equal(ensuredCandidateProfile.email, "rohitpanchal958466@gmail.com");

    const targetMembership = companyCandidatesDb.find(
      (cc) => cc.companyId === TARGET_COMPANY_ID && cc.candidateId === ensuredCandidateProfile.id
    );
    assert.ok(targetMembership, "CompanyCandidate record must link candidate to Facebook Company");
  });

  it("rejects application when sender is an active HR/staff member of the TARGET company", async () => {
    // User is an HR/Owner of Facebook Company itself
    const facebookHrUser = {
      id: "fb_hr_user_id_456",
      email: "vs2917239@gmail.com",
      name: "Facebook HR",
      role: "HR",
      status: "ACTIVE",
      companyMembers: [
        {
          companyId: TARGET_COMPANY_ID,
          role: "OWNER",
        },
      ],
    };
    existingUsersDb.set(facebookHrUser.email, facebookHrUser);

    await assert.rejects(
      async () => {
        await createCandidateIfRequired({
          extractedData: {
            name: "Facebook HR",
            email: "vs2917239@gmail.com",
            skills: ["HR Management", "Recruitment"],
          },
          sourceEmail: "vs2917239@gmail.com",
          companyId: TARGET_COMPANY_ID,
          source: "INBOUND_EMAIL",
        });
      },
      (err) => {
        assert.equal(err.code, "CANDIDATE_EMAIL_CONFLICT");
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  it("rejects application when sender is a platform SUPER_ADMIN", async () => {
    const superAdminUser = {
      id: "super_admin_id_789",
      email: "admin@hirequest.com",
      name: "Global Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      companyMembers: [],
    };
    existingUsersDb.set(superAdminUser.email, superAdminUser);

    await assert.rejects(
      async () => {
        await createCandidateIfRequired({
          extractedData: {
            name: "Global Admin",
            email: "admin@hirequest.com",
            skills: ["System Administration"],
          },
          sourceEmail: "admin@hirequest.com",
          companyId: TARGET_COMPANY_ID,
          source: "INBOUND_EMAIL",
        });
      },
      (err) => {
        assert.equal(err.code, "CANDIDATE_EMAIL_CONFLICT");
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  it("preserves existing candidate profile belonging to another company while adding target company membership", async () => {
    // An ordinary candidate already registered under Microsoft IT Company
    const candidateUser = {
      id: "cand_usr_001",
      email: "candidate.multicompany@gmail.com",
      name: "Alice Developer",
      role: "CANDIDATE",
      status: "ACTIVE",
      companyMembers: [],
    };
    existingUsersDb.set(candidateUser.email, candidateUser);

    // Initial profile created under Microsoft IT Company
    const initialProfile = {
      id: "prof_initial_001",
      userId: candidateUser.id,
      companyId: OTHER_COMPANY_ID, // Microsoft IT Company
      email: candidateUser.email,
      firstName: "Alice",
      lastName: "Developer",
      metadata: { skills: ["Java", "Spring Boot"] },
    };
    candidateProfilesDb.set(candidateUser.email, initialProfile);
    companyCandidatesDb.push({
      companyId: OTHER_COMPANY_ID,
      candidateId: initialProfile.id,
    });

    // Alice now applies to Facebook Company
    const result = await createCandidateIfRequired({
      extractedData: {
        name: "Alice Developer",
        email: "candidate.multicompany@gmail.com",
        skills: ["Java", "React", "Docker"],
      },
      sourceEmail: "candidate.multicompany@gmail.com",
      companyId: TARGET_COMPANY_ID,
      source: "INBOUND_EMAIL",
    });

    assert.equal(result.candidate.id, candidateUser.id);
    assert.equal(result.created, false);

    // Initial companyId on candidateProfile is preserved
    const profile = candidateProfilesDb.get(candidateUser.email);
    assert.equal(profile.companyId, OTHER_COMPANY_ID);

    // Microsoft IT Company's membership is still present
    const otherCompanyLink = companyCandidatesDb.find(
      (cc) => cc.companyId === OTHER_COMPANY_ID && cc.candidateId === profile.id
    );
    assert.ok(otherCompanyLink, "Microsoft IT Company membership must remain intact");

    // Facebook Company's membership is also added
    const targetCompanyLink = companyCandidatesDb.find(
      (cc) => cc.companyId === TARGET_COMPANY_ID && cc.candidateId === profile.id
    );
    assert.ok(targetCompanyLink, "Facebook Company membership must be added");
  });

  it("handles ordinary new candidate direct upload without existing account", async () => {
    const result = await createCandidateIfRequired({
      extractedData: {
        name: "New Candidate",
        email: "new.developer@gmail.com",
        skills: ["Python", "Django"],
      },
      sourceEmail: null,
      companyId: TARGET_COMPANY_ID,
      source: "DIRECT_UPLOAD",
    });

    assert.equal(result.created, true);
    assert.equal(result.candidate.email, "new.developer@gmail.com");
    assert.equal(result.candidate.role, "CANDIDATE");
    assert.equal(capturedTargetCompanyId, TARGET_COMPANY_ID);
  });

  it("handles forwarded resume where candidate is HR in another company", async () => {
    // External HR applicant whose resume was forwarded by a recruiter
    const externalHrUser = {
      id: "ext_hr_777",
      email: "recruiter.applicant@partner.com",
      name: "Partner Recruiter",
      role: "HR",
      status: "ACTIVE",
      companyMembers: [
        {
          companyId: "partner_company_999",
          role: "RECRUITER",
        },
      ],
    };
    existingUsersDb.set(externalHrUser.email, externalHrUser);

    const result = await createCandidateIfRequired({
      extractedData: {
        name: "Partner Recruiter",
        email: "recruiter.applicant@partner.com",
        skills: ["Talent Acquisition", "Technical Sourcing"],
      },
      sourceEmail: "recruiter.applicant@partner.com", // reliably extracted from forwarded header
      isForwarded: true,
      companyId: TARGET_COMPANY_ID,
      source: "INBOUND_EMAIL",
    });

    assert.equal(result.created, false);
    assert.equal(result.candidate.role, "HR");
    assert.equal(result.candidate.companyMembers[0].companyId, "partner_company_999");
    assert.equal(capturedTargetCompanyId, TARGET_COMPANY_ID);
  });

  it("continues to reject requests missing any valid candidate email", async () => {
    await assert.rejects(
      async () => {
        await createCandidateIfRequired({
          extractedData: {
            name: "Nameless Candidate",
            skills: ["JavaScript"],
          },
          sourceEmail: null,
          companyId: TARGET_COMPANY_ID,
          source: "INBOUND_EMAIL",
        });
      },
      (err) => {
        assert.equal(err.code, "CANDIDATE_EMAIL_NOT_FOUND");
        assert.equal(err.statusCode, 422);
        return true;
      }
    );
  });
});
